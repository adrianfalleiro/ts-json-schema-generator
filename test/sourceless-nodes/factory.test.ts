import assert from "node:assert";
import path from "node:path";
import { describe, it } from "node:test";
import * as factory from "@typescript/native/ast/factory";
import { createParser } from "../../factory";
import { DEFAULT_CONFIG } from "../../src/Config.js";
import { Context } from "../../src/NodeParser.js";
import { ObjectType } from "../../src/Type/ObjectType.js";
import { StringType } from "../../src/Type/StringType.js";
import { derefType } from "../../src/Utils/derefType.js";
import * as ts from "../../src/ts.js";

const SOURCE = path.resolve(__dirname, "./source.ts");

describe("sourceless-nodes created with the factory", () => {
    it("keeps the property names of type literals", () => {
        const program = ts.createProgram([SOURCE], {});
        const parser = createParser(program, DEFAULT_CONFIG);

        const node = factory.createTypeLiteralNode([
            factory.createPropertySignatureDeclaration(
                undefined,
                factory.createIdentifier("__a"),
                undefined,
                factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
                undefined as never,
            ),
        ]);

        const type = parser.createType(node, new Context(node));

        const objectType = derefType(type);
        assert.ok(objectType instanceof ObjectType);
        const [prop] = objectType.getProperties();
        assert.strictEqual(prop.getName(), "__a");
        assert.ok(prop.getType() instanceof StringType);
    });
});
