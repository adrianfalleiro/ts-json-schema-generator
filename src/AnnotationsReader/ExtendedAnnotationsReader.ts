import json5 from "json5";
import * as ts from "../ts.js";
import type { Annotations } from "../Type/AnnotatedType.js";
import { getFullDescription } from "../Utils/getFullDescription.js";
import { BasicAnnotationsReader } from "./BasicAnnotationsReader.js";

export class ExtendedAnnotationsReader extends BasicAnnotationsReader {
    public constructor(
        private typeChecker: ts.TypeChecker,
        extraTags?: Set<string>,
        private markdownDescription?: boolean,
        private fullDescription?: boolean,
    ) {
        super(extraTags);
    }

    public getAnnotations(node: ts.Node): Annotations | undefined {
        const annotations: Annotations = {
            ...this.getDescriptionAnnotation(node),
            ...this.getTypeAnnotation(node),
            ...this.getExampleAnnotation(node),
            ...super.getAnnotations(node),
        };
        return Object.keys(annotations).length ? annotations : undefined;
    }

    public isNullable(node: ts.Node): boolean {
        const jsDocTags = ts.getJsDocTagsOfNode(node);
        if (!jsDocTags || !jsDocTags.length) {
            return false;
        }

        const jsDocTag: ts.JSDocTagInfo | undefined = jsDocTags.find((tag: ts.JSDocTagInfo) => tag.name === "nullable");
        return !!jsDocTag;
    }

    private getDescriptionAnnotation(node: ts.Node): Annotations | undefined {
        const comments = this.typeChecker.getDocumentationCommentOfNode(node);
        if (!comments) {
            return undefined;
        }

        const annotations: { description?: string; markdownDescription?: string; fullDescription?: string } = {};

        if (comments && comments.length) {
            const markdownDescription = comments
                .map((comment) => comment.text)
                .join(" ")
                .replace(/\r/g, "")
                .trim();

            annotations.description = markdownDescription.replace(/(?<=[^\n])\n(?=[^\n*-])/g, " ").trim();

            if (this.markdownDescription) {
                annotations.markdownDescription = markdownDescription;
            }
        }

        if (this.fullDescription) {
            const fullDescription = getFullDescription(node)?.trim();
            if (fullDescription) {
                annotations.fullDescription = fullDescription;
            }
        }

        return Object.keys(annotations).length ? annotations : undefined;
    }

    private getTypeAnnotation(node: ts.Node): Annotations | undefined {
        const jsDocTags = ts.getJsDocTagsOfNode(node);
        if (!jsDocTags || !jsDocTags.length) {
            return undefined;
        }

        const jsDocTag = jsDocTags.find((tag) => tag.name === "asType");
        if (!jsDocTag) {
            return undefined;
        }

        const text = (jsDocTag.text ?? []).map((part) => part.text).join("");
        return { type: text };
    }
    /**
     * Attempts to gather examples from the @-example jsdoc tag.
     * See https://tsdoc.org/pages/tags/example/
     */
    private getExampleAnnotation(node: ts.Node): Annotations | undefined {
        const jsDocTags = ts.getJsDocTagsOfNode(node);
        if (!jsDocTags || !jsDocTags.length) {
            return undefined;
        }

        const examples: unknown[] = [];
        for (const example of jsDocTags.filter((tag) => tag.name === "example")) {
            const text = (example.text ?? []).map((part) => part.text).join("");
            try {
                examples.push(json5.parse(text));
            } catch {
                // ignore examples which don't parse to valid JSON
                // This could be improved to support a broader range of usages,
                // such as if the example has a title (as explained in the tsdoc spec).
            }
        }

        if (examples.length === 0) {
            return undefined;
        }

        return { examples };
    }
}
