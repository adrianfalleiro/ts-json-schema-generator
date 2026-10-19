import * as ts from "../ts.js";

export type PartialDiagnostic = {
    code: number;

    /** The error message */
    messageText: string;

    /** If we should populate `fileName`, `pos`, `end` and the positions with this node information */
    node?: ts.Node;

    /** @default Error */
    category?: ts.DiagnosticCategory;

    relatedInformation?: ts.Diagnostic[];
};

/**
 * Base error for ts-json-schema-generator
 */
export abstract class BaseError extends Error {
    readonly diagnostic: ts.Diagnostic;

    constructor(diagnostic: PartialDiagnostic) {
        super(diagnostic.messageText);
        this.diagnostic = BaseError.createDiagnostic(diagnostic);
    }

    static createDiagnostic({
        code,
        messageText,
        node,
        category,
        relatedInformation,
    }: PartialDiagnostic): ts.Diagnostic {
        const diagnostic: ts.Diagnostic = {
            // Differentiates from errors from the TypeScript compiler
            // error TSJ - 100: message
            source: "TSJ - ",
            code,
            text: messageText,
            category: category ?? ts.DiagnosticCategory.Error,
            pos: 0,
            end: 0,
            relatedInformation,
        };

        // Swap the node for the file and position information
        // sourceless nodes cannot be referenced in the diagnostic
        const sourceFile = node && node.pos !== -1 ? ts.getSourceFileOfNode(node) : undefined;
        if (node && sourceFile) {
            const start = node.getStart();
            const end = node.getEnd();
            const startPosition = sourceFile.getLineAndCharacterOfPosition(start);
            const endPosition = sourceFile.getLineAndCharacterOfPosition(end);
            const lines = sourceFile.text.split(/\r?\n/);

            Object.assign(diagnostic, {
                fileName: sourceFile.fileName,
                pos: start,
                end,
                startPosition,
                endPosition,
                sourceLines: lines
                    .slice(startPosition.line, endPosition.line + 1)
                    .map((text, i) => ({ line: startPosition.line + i, text })),
            });
        }

        return diagnostic;
    }

    format(isTTY = process.env.TTY || process.stdout.isTTY): string {
        const formatter = isTTY ? ts.formatDiagnosticsWithColorAndContext : ts.formatDiagnostics;

        return formatter([this.diagnostic], {
            getCanonicalFileName: (fileName) => fileName,
            getCurrentDirectory: () => "",
            getNewLine: () => "\n",
        });
    }
}
