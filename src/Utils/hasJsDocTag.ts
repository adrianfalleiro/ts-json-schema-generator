import * as ts from "../ts.js";

export function hasJsDocTag(node: ts.Node, tagName: string): boolean {
    return ts.getJsDocTagsOfNode(node)?.some((tag) => tag.name === tagName) ?? false;
}
