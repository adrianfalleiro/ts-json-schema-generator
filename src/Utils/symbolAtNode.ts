import * as ts from "../ts.js";

export function symbolAtNode(node: ts.Node): ts.Symbol | undefined {
    return ts.getSymbolOfNode(node);
}
