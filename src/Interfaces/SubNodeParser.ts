import type * as ts from "../ts.js";
import type { NodeParser } from "../NodeParser.js";

export interface SubNodeParser extends NodeParser {
    supportsNode(node: ts.Node): boolean;
}
