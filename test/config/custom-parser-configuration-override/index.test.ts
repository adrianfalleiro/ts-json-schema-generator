import { it } from "node:test";
import { ts, type BaseType, type Context, type ReferenceType, type SubNodeParser } from "../../../index";
import { StringType } from "../../../src/Type/StringType";
import { assertConfigSchema } from "../../utils";

class ExampleNullParser implements SubNodeParser {
    supportsNode(node: ts.Node): boolean {
        return node.kind === ts.SyntaxKind.NullKeyword;
    }
    createType(node: ts.Node, context: Context, reference?: ReferenceType): BaseType {
        return new StringType();
    }
}

it(
    "config - custom-parser-configuration-override",
    assertConfigSchema(
        "custom-parser-configuration-override",
        {
            type: "MyObject",
        },
        false,
        undefined,
        (parser) => parser.addNodeParser(new ExampleNullParser()),
    ),
);
