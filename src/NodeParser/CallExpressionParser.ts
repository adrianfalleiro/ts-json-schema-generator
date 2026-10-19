import { TupleType } from "../Type/TupleType.js";
import * as ts from "../ts.js";
import type { NodeParser } from "../NodeParser.js";
import { Context } from "../NodeParser.js";
import type { SubNodeParser } from "../SubNodeParser.js";
import type { BaseType } from "../Type/BaseType.js";
import { UnionType } from "../Type/UnionType.js";
import { LiteralType, type LiteralValue } from "../Type/LiteralType.js";
import { SymbolType } from "../Type/SymbolType.js";
import { UnknownNodeError } from "../Error/Errors.js";

export class CallExpressionParser implements SubNodeParser {
    public constructor(
        protected typeChecker: ts.TypeChecker,
        protected childNodeParser: NodeParser,
    ) {}

    public supportsNode(node: ts.CallExpression): boolean {
        return node.kind === ts.SyntaxKind.CallExpression;
    }
    public createType(node: ts.CallExpression, context: Context): BaseType {
        const type = this.typeChecker.getTypeAtLocation(node);

        // FIXME: remove special case
        const typeArgument = this.typeChecker.getTypeArguments(type)[0];
        if (typeArgument?.isUnionType() || typeArgument?.isIntersectionType()) {
            return new TupleType([
                new UnionType(
                    typeArgument.getTypes().map((t) => new LiteralType((t as ts.LiteralType).value as LiteralValue)),
                ),
            ]);
        }

        // A call expression like Symbol("entity") that resulted in a `unique symbol`
        if (type.flags === ts.TypeFlags.UniqueESSymbol) {
            return new SymbolType();
        }

        const symbol = type.getSymbol() || type.getAliasSymbol();

        // For funtions like <T>(type: T) => T, there won't be any reference to the original
        // type. Using type checker to infer the actual return type without mapping the whole
        // function and back referencing its generic type based on parameter index is a better
        // approach.
        const decl =
            this.typeChecker.typeToTypeNode(type, node, ts.NodeBuilderFlags.IgnoreErrors) ||
            (symbol && (ts.getValueDeclaration(symbol) || ts.getDeclarations(symbol)[0]));

        if (!decl) {
            throw new UnknownNodeError(node);
        }

        return this.childNodeParser.createType(decl, this.createSubContext(node, context));
    }

    protected createSubContext(node: ts.CallExpression, parentContext: Context): Context {
        const subContext = new Context(node);

        for (const arg of node.arguments) {
            const type = this.childNodeParser.createType(arg, parentContext);
            subContext.pushArgument(type);
        }
        return subContext;
    }
}
