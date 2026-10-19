import assert from "node:assert";
import { it } from "node:test";
import { serverFS } from "@typescript/native/fs";
import { createGenerator } from "../../factory/generator";
import type { Config } from "../../src/Config";
import * as ts from "../../src/ts";

it("Can generate a schema from a vfs", () => {
    const tsInterface = `
    /**
     * This is a sample interface
     */
    export interface SampleInterface {
        /** This is a name */
        name: string;
    }
    `;

    const fsMap = new Map<string, string>();
    fsMap.set("/schema.ts", tsInterface);

    // Files that are not in the map are read from the disk, e.g. for lib.d.ts lookups
    const api = new ts.API({
        cwd: __dirname,
        fs: {
            directoryExists: serverFS.useOS,
            fileExists: (fileName) => fsMap.has(fileName) || serverFS.useOS,
            getAccessibleEntries: serverFS.useOS,
            readFile: (fileName) => fsMap.get(fileName) ?? serverFS.useOS,
            realpath: (path) => (fsMap.has(path) ? path : serverFS.useOS),
            stat: serverFS.fakeStat,
            writeFile: serverFS.noop,
            removeFile: serverFS.noop,
        },
    });
    const program = api.createProgram(["/schema.ts"], {});

    const schemaConfig: Config = { path: "/schema.ts", tsProgram: program };
    const generator = createGenerator(schemaConfig);

    const result = generator.createSchema();
    assert.deepStrictEqual(result, {
        $ref: "#/definitions/SampleInterface",
        $schema: "http://json-schema.org/draft-07/schema#",
        definitions: {
            SampleInterface: {
                additionalProperties: false,
                description: "This is a sample interface",
                properties: {
                    name: {
                        description: "This is a name",
                        type: "string",
                    },
                },
                required: ["name"],
                type: "object",
            },
        },
    });
});
