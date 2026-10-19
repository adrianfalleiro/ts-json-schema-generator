import * as ts from "../ts.js";
import type { Context, NodeParser } from "../NodeParser.js";
import type { SubNodeParser } from "../SubNodeParser.js";
import type { BaseType } from "../Type/BaseType.js";

export class PropertyAccessExpressionParser implements SubNodeParser {
    public constructor(
        protected typeChecker: ts.TypeChecker,
        protected childNodeParser: NodeParser,
    ) {}

    public supportsNode(node: ts.PropertyAccessExpression): boolean {
        return node.kind === ts.SyntaxKind.PropertyAccessExpression;
    }

    public createType(node: ts.PropertyAccessExpression, context: Context): BaseType {
        const type = this.typeChecker.getTypeAtLocation(node);
        return this.childNodeParser.createType(ts.getDeclarations(type.getSymbol()!)[0], context);
    }
}
