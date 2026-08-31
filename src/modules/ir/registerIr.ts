import type { Monaco } from "@monaco-editor/react";
import * as monacoEditor from "monaco-editor";
import {
    IR_KEYWORDS,
    PATTERN_PIECE_ID,
    PATTERN_PIECE_IMM,
    PATTERN_PIECE_SIZE
} from "../vm/decoder";

let isIrRegistered: boolean = false;

export const irLanguageId = "ir";

export function registerIr(monaco: Monaco) {
    if (isIrRegistered) {
        return;
    }

    monaco.languages.register({
        id: irLanguageId
    });

    // 修改主题：为 ARG 添加淡化颜色
    monaco.editor.defineTheme("ir-theme", {
        base: "vs",
        inherit: true,
        rules: [
            {
                token: "function",
                foreground: "#74531f"
            },
            {
                token: "number.size",
                foreground: "#0097ff"
            },
            // 新增：淡化 ARG 关键字和操作数（接近背景色）
            {
                token: "arg.keyword",
                foreground: "#e0e0e0"
            },
            {
                token: "arg.operand",
                foreground: "#e0e0e0"
            }
        ],
        colors: {}
    });

    const irWhiteSpacePattern = "[ \\t\\r\\n]+";

    // 修改 Monarch 语法：添加 ARG 特殊规则和 arg-state
    monaco.languages.setMonarchTokensProvider(irLanguageId, {
        keywords: IR_KEYWORDS,
        identifier: PATTERN_PIECE_ID,
        whitespace: irWhiteSpacePattern,
        defaultToken: "source",
        tokenizer: {
            root: [
                [`#${PATTERN_PIECE_IMM}`, "number"],
                [PATTERN_PIECE_SIZE, "number.size"],
                [
                    /(=)|(\+)|(-)|(\*)|(\/)|(==)|(!=)|(<=)|(<)|(>=)|(>)|(&)/,
                    "operators"
                ],
                [/:/, "delimiter"],
                [/;.*/, "comment"],
                [/@whitespace/, "white"],
                [
                    /(function)(@whitespace)(@identifier)/,
                    ["keyword", "white", "function"]
                ],
                [
                    /(call)(@whitespace)(@identifier)/,
                    ["keyword", "white", "function"]
                ],
                // 新增：匹配 ARG 指令（小写），切换到 arg-state
                [
                    /(arg)(@whitespace)/,
                    ["arg.keyword", "white", { token: "@pop", next: "@arg-state" }]
                ],
                [
                    /@identifier/,
                    {
                        cases: {
                            "@keywords": "keyword",
                            "@default": "identifier"
                        }
                    }
                ]
            ],
            // 新增 arg-state 状态：匹配操作数（支持 #、*、& 和标识符/数字）
            "arg-state": [
                [
                    /(?:#|-?)?\S+/,
                    { token: "arg.operand", next: "@pop" }
                ],
                [/@whitespace/, "white", "@pop"]
            ]
        }
    });

    const irKeywordSnippetParts = [
        "function ${1:id} :",
        "dec ${1:id} ${2:size}",
        "global_dec ${1:id} ${2:size}",
        "label ${1:id} :",
        "goto ${1:label}",
        "if ${1:condition} goto ${2:label}",
        "arg ${1:value}",
        "param ${1:id}",
        "call ${1:id}",
        "return ${1:value}",
        "read ${1:id}",
        "write ${1:value}"
    ];

    monaco.languages.registerCompletionItemProvider(irLanguageId, {
        provideCompletionItems: (model, position) => {
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn
            };
            return {
                suggestions: [
                    ...IR_KEYWORDS.map(x => ({
                        label: x,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        insertText: x,
                        range
                    })),
                    ...IR_KEYWORDS.map((x, i) => ({
                        label: `${x} Snippet`,
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: irKeywordSnippetParts[i],
                        insertTextRules:
                            monaco.languages.CompletionItemInsertTextRule
                                .InsertAsSnippet,
                        range
                    }))
                ]
            };
        }
    });

    monaco.languages.registerFoldingRangeProvider(irLanguageId, {
        provideFoldingRanges: model => {
            const lines = model.getLinesContent();
            const ranges: monacoEditor.languages.FoldingRange[] = [];
            let functionLineNumber = -1;
            let returnLineNumber = -1;
            let nonEmptyLineNumber = -1;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();

                if (line !== "") {
                    nonEmptyLineNumber = i + 1;
                }

                if (
                    line.match(
                        `^function${irWhiteSpacePattern}` +
                            `${PATTERN_PIECE_ID}${irWhiteSpacePattern}:$`
                    )
                ) {
                    if (functionLineNumber !== -1 && returnLineNumber !== -1) {
                        ranges.push({
                            start: functionLineNumber,
                            end: returnLineNumber,
                            kind: monaco.languages.FoldingRangeKind.Region
                        });

                        returnLineNumber = -1;
                    }
                    functionLineNumber = i + 1;
                } else if (
                    line.match(
                        `^return${irWhiteSpacePattern}` +
                            `((#${PATTERN_PIECE_IMM})|(${PATTERN_PIECE_ID})|` +
                            `(\\*${PATTERN_PIECE_ID})|` +
                            `(&${PATTERN_PIECE_ID}))$`
                    )
                ) {
                    returnLineNumber = i + 1;
                }
            }

            ranges.push({
                start: functionLineNumber,
                end: nonEmptyLineNumber,
                kind: monaco.languages.FoldingRangeKind.Region
            });

            return ranges;
        }
    });

    monaco.languages.setLanguageConfiguration(irLanguageId, {
        comments: {
            lineComment: ";"
        }
    });

    isIrRegistered = true;
}