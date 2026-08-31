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

    monaco.editor.defineTheme("ir-theme", {
        base: "vs",
        inherit: true,
        rules: [
            { token: "function", foreground: "#74531f" },
            { token: "number.size", foreground: "#0097ff" },
            // 淡化 ARG 关键字和操作数（之前已添加）
            { token: "arg.keyword", foreground: "#e0e0e0" },
            { token: "arg.operand", foreground: "#e0e0e0" },
            // 新增：淡化立即数（#数字）
            { token: "number.imm", foreground: "#e0e0e0" }
        ],
        colors: {}
    });

    const irWhiteSpacePattern = "[ \\t\\r\\n]+";

    monaco.languages.setMonarchTokensProvider(irLanguageId, {
        keywords: IR_KEYWORDS,
        identifier: PATTERN_PIECE_ID,
        whitespace: irWhiteSpacePattern,
        defaultToken: "source",
        tokenizer: {
            root: [
                // 修改：将立即数标记为 number.imm
                [`#${PATTERN_PIECE_IMM}`, "number.imm"],
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
                // ARG 淡化规则（已存在）
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