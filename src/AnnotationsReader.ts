import type * as ts from "./ts.js";
import type { Annotations } from "./Type/AnnotatedType.js";

export interface AnnotationsReader {
    getAnnotations(node: ts.Node): Annotations | undefined;
}
