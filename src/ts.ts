/**
 * The TypeScript API used by the generator.
 *
 * Programs are created and type checked by TypeScript 7 through its (unstable) synchronous API. That API exposes the same AST and almost
 * the same checker as TypeScript 5, so this module re-exports it and adds the few pieces the generator relied on that
 * TypeScript 7 no longer offers (symbols of declarations, synthesized nodes with symbols, ...).
 */
import {
    API,
    type Checker,
    type CompilerOptions,
    type Program,
    type Symbol,
    SymbolFlags,
    type Type,
    type NodeBuilderFlags,
} from "@typescript/native/sync";
import path from "node:path";
import {
    ModifierFlags,
    NodeFlags,
    SyntaxKind,
    getCombinedModifierFlags,
    getJSDocCommentsAndTags,
    getNameOfDeclaration,
    isExternalModule,
    type Declaration,
    type EntityName,
    type Expression,
    type Identifier,
    type JSDoc,
    type JSDocComment,
    type JSDocLink,
    type JSDocTag,
    type ImportTypeNode,
    type ConstructorDeclaration,
    type DeclarationName,
    type MethodSignatureDeclaration,
    type ModifierLike,
    type Node,
    type NodeArray,
    type ParameterDeclaration,
    type PropertySignatureDeclaration,
    type SourceFile,
    type TypeNode,
} from "@typescript/native/ast";

import * as tsAst from "@typescript/native/ast";
import * as tsIs from "@typescript/native/ast/is";

// `export *` defines the exports of this CommonJS module as getters into the TypeScript ES modules, which the parsers then
// call for every `ts.SyntaxKind` or `ts.isX`. Copying the exports as plain properties first makes `export *` skip them.
Object.assign(exports, tsAst, tsIs);

export * from "@typescript/native/ast";
export * from "@typescript/native/ast/is";
export {
    API,
    DiagnosticCategory,
    ModuleKind,
    NodeBuilderFlags,
    SymbolFlags,
    TypeFlags,
    formatDiagnostics,
    formatDiagnosticsWithColorAndContext,
} from "@typescript/native/sync";
export type {
    CompilerOptions,
    Diagnostic,
    LiteralType,
    ParsedCommandLine,
    Program,
    Symbol,
    Type,
} from "@typescript/native/sync";

// Names of the TypeScript 5 API that changed in TypeScript 7
export type PropertySignature = PropertySignatureDeclaration;
export type MethodSignature = MethodSignatureDeclaration;
export type NamedDeclaration = Declaration & { readonly name?: DeclarationName };
export type HasModifiers = Node & { readonly modifiers?: NodeArray<ModifierLike> };
export type ParameterPropertyDeclaration = ParameterDeclaration & {
    readonly parent: ConstructorDeclaration;
    readonly name: Identifier;
};
export { isPropertySignatureDeclaration as isPropertySignature } from "@typescript/native/ast/is";
export { isMethodSignatureDeclaration as isMethodSignature } from "@typescript/native/ast/is";

export function isParameterPropertyDeclaration(node: Node, parent: Node): node is ParameterPropertyDeclaration {
    return (
        node.kind === SyntaxKind.Parameter &&
        parent.kind === SyntaxKind.Constructor &&
        !!(getCombinedModifierFlags(node as Declaration) & ModifierFlags.ParameterPropertyModifier)
    );
}

/**
 * Whether a property, property signature or parameter is optional. TypeScript 7 stores the `?` of properties in
 * `postfixToken`.
 */
export function hasQuestionToken(node: Node): boolean {
    const { questionToken, postfixToken } = node as { questionToken?: Node; postfixToken?: Node };
    return !!questionToken || postfixToken?.kind === SyntaxKind.QuestionToken;
}

let sharedApi: API | undefined;

/**
 * Returns the TypeScript API instance used to create programs. The TypeScript process is spawned on first use.
 */
export function getAPI(): API {
    sharedApi ??= new API({ cwd: process.cwd() });
    return sharedApi;
}

/**
 * Like `findConfigFile` from TypeScript 5: looks for a config file in the given directory and its ancestors.
 */
export function findConfigFile(
    searchPath: string,
    fileExists: (fileName: string) => boolean,
    configName = "tsconfig.json",
): string | undefined {
    let directory = path.resolve(searchPath);
    for (;;) {
        const fileName = path.join(directory, configName);
        if (fileExists(fileName)) {
            return fileName;
        }
        const parent = path.dirname(directory);
        if (parent === directory) {
            return undefined;
        }
        directory = parent;
    }
}

export function createProgram(rootNames: readonly string[], options: CompilerOptions): Program {
    return getAPI().createProgram(rootNames, withAbsolutePaths(options));
}

/**
 * `paths` from a tsconfig are relative to its directory, which the API does not keep (the internal `pathsBasePath`
 * option), so they are made absolute.
 */
function withAbsolutePaths(options: CompilerOptions): CompilerOptions {
    const { paths, pathsBasePath } = options as { paths?: Record<string, string[]>; pathsBasePath?: string };
    if (!paths || !pathsBasePath) {
        return options;
    }

    return {
        ...options,
        paths: Object.fromEntries(
            Object.entries(paths).map(([pattern, substitutions]) => [
                pattern,
                substitutions.map((substitution) => path.resolve(pathsBasePath, substitution)),
            ]),
        ),
    };
}

/**
 * Like `getPreEmitDiagnostics` from TypeScript 5.
 */
export function getPreEmitDiagnostics(program: Program) {
    return [
        ...program.getConfigFileParsingDiagnostics(),
        ...program.getProgramDiagnostics(),
        ...program.getSyntacticDiagnostics(),
        ...program.getGlobalDiagnostics(),
        ...program.getSemanticDiagnostics(),
    ];
}

/**
 * Root files of a program, i.e. the files it was created from.
 */
export function getRootFileNames(program: Program): readonly string[] {
    return program.getProject().parsedCommandLine.fileNames;
}

/**
 * All source files of a program, including declaration and library files.
 */
export function getSourceFiles(program: Program): SourceFile[] {
    return program
        .getSourceFileNames()
        .map((fileName) => program.getSourceFile(fileName))
        .filter((sourceFile): sourceFile is SourceFile => !!sourceFile);
}

export function forEachChild<T>(node: Node, cb: (node: Node) => T): T | undefined {
    return node.forEachChild(cb);
}

/**
 * Like `getCombinedNodeFlags` from TypeScript 5: merges the flags of variable declarations with the flags of their
 * declaration list and statement.
 */
export function getCombinedNodeFlags(node: Node): NodeFlags {
    let flags = node.flags;
    if (node.kind === SyntaxKind.VariableDeclaration) {
        node = node.parent;
    }
    if (node && node.kind === SyntaxKind.VariableDeclarationList) {
        flags |= node.flags;
        node = node.parent;
    }
    if (node && node.kind === SyntaxKind.VariableStatement) {
        flags |= node.flags;
    }
    return flags;
}

/**
 * Like `node.getSourceFile()` in TypeScript 5: walks up the parents of a node to find its source file. Nodes
 * synthesized by the checker (e.g. by `typeToTypeNode`) do not have one.
 */
export function getSourceFileOfNode(node: Node): SourceFile | undefined {
    let current: Node | undefined = node;
    while (current && current.kind !== SyntaxKind.SourceFile) {
        current = current.parent;
    }
    return current as SourceFile | undefined;
}

/**
 * Whether the node was synthesized by the checker and is not part of a source file.
 */
export function isSynthesizedNode(node: Node): boolean {
    return node.getSourceFile().kind !== SyntaxKind.SourceFile;
}

/**
 * Whether the declaration is exported from its container, i.e. it has the `localSymbol.exportSymbol` TypeScript 5 used
 * to set on exported declarations.
 */
export function isExportedDeclaration(node: Node): boolean {
    if (getCombinedModifierFlags(node as Declaration) & ModifierFlags.Export) {
        return true;
    }

    // Declarations in ambient modules and declaration modules without exports are implicitly exported. Declarations of
    // global scripts (such as the default library) are not module members.
    const container = node.parent?.kind === SyntaxKind.ModuleBlock ? node.parent.parent : node.parent;
    if (!container || !(container.flags & NodeFlags.ExportContext)) {
        return false;
    }
    return container.kind !== SyntaxKind.SourceFile || isExternalModule(container as SourceFile);
}

interface SynthesizedOrigin {
    checker: TypeChecker;
    enclosingDeclaration: Node | undefined;
}

/** Where nodes created by `typeToTypeNode` come from, keyed by the root of the synthesized tree */
const synthesizedOrigins = new WeakMap<Node, SynthesizedOrigin>();

const checkers = new WeakMap<Program, TypeChecker>();
const checkerList: WeakRef<TypeChecker>[] = [];
const sourceFileCheckers = new WeakMap<SourceFile, TypeChecker>();

/**
 * Returns the type checker of a program.
 */
export function getTypeChecker(program: Program): TypeChecker {
    let checker = checkers.get(program);
    if (!checker) {
        checker = new TypeChecker(program);
        checkers.set(program, checker);
        checkerList.push(new WeakRef(checker));
    }
    return checker;
}

/**
 * Returns the type checker of the program a node belongs to.
 */
function getCheckerOfNode(node: Node): TypeChecker | undefined {
    const root = node.getSourceFile();
    const origin = synthesizedOrigins.get(root);
    if (origin) {
        return origin.checker;
    }

    const sourceFile = getSourceFileOfNode(node);
    if (!sourceFile) {
        return undefined;
    }

    let checker = sourceFileCheckers.get(sourceFile);
    if (!checker) {
        const candidates = checkerList
            .map((ref) => ref.deref())
            .filter((candidate) => candidate?.hasSourceFileName(sourceFile.fileName));
        // Only ask the programs (one request each) when several have a file of that name
        checker =
            candidates.length === 1
                ? candidates[0]
                : candidates.find((candidate) => candidate!.program.getSourceFile(sourceFile.fileName) === sourceFile);
        if (checker) {
            sourceFileCheckers.set(sourceFile, checker);
        }
    }

    return checker;
}

/**
 * Whether the node is declared in a default library file (`lib.*.d.ts`).
 */
export function isDefaultLibraryNode(node: Node): boolean {
    const sourceFile = getSourceFileOfNode(node);
    if (!sourceFile) {
        return false;
    }

    let isDefaultLibrary = defaultLibraryFiles.get(sourceFile);
    if (isDefaultLibrary === undefined) {
        const checker = getCheckerOfNode(sourceFile);
        isDefaultLibrary = !!checker && checker.program.isSourceFileDefaultLibrary(sourceFile);
        defaultLibraryFiles.set(sourceFile, isDefaultLibrary);
    }

    return isDefaultLibrary;
}

const defaultLibraryFiles = new WeakMap<SourceFile, boolean>();

/**
 * Like reading the internal `node.symbol` in TypeScript 5: returns the symbol a declaration declares.
 */
export function getSymbolOfNode(node: Node): Symbol | undefined {
    return getCheckerOfNode(node)?.getSymbolOfNode(node);
}

/**
 * The resolved declarations of a symbol.
 */
export function getDeclarations(symbol: Symbol): Declaration[] {
    let declarations = symbolDeclarations.get(symbol);
    if (!declarations) {
        declarations = symbol.declarations
            .map((handle) => handle.resolve())
            .filter((declaration): declaration is Declaration => !!declaration);
        symbolDeclarations.set(symbol, declarations);
    }
    return declarations;
}

const symbolDeclarations = new WeakMap<Symbol, Declaration[]>();

/**
 * The resolved value declaration of a symbol.
 */
export function getValueDeclaration(symbol: Symbol): Declaration | undefined {
    return symbol.valueDeclaration?.resolve();
}

/**
 * Like `symbol.getJsDocTags()` in TypeScript 5: the JSDoc tags of the declarations of a symbol.
 */
export function getJsDocTags(symbol: Symbol): JSDocTagInfo[] {
    let tags = symbolTags.get(symbol);
    if (!tags) {
        tags = getJsDocTagsFromDeclarations(getDeclarations(symbol));
        symbolTags.set(symbol, tags);
    }
    return tags;
}

const symbolTags = new WeakMap<Symbol, JSDocTagInfo[]>();

/**
 * The JSDoc tags of the symbol a node declares, or undefined if it declares none. Anonymous declarations are the only
 * declaration of their symbol, so they do not need a request to the checker.
 */
export function getJsDocTagsOfNode(node: Node): JSDocTagInfo[] | undefined {
    if (isAnonymousDeclaration(node)) {
        let tags = nodeTags.get(node);
        if (!tags) {
            tags = getJsDocTagsFromDeclarations([node as Declaration]);
            nodeTags.set(node, tags);
        }
        return tags;
    }

    const symbol = getSymbolOfNode(node);
    return symbol && getJsDocTags(symbol);
}

const nodeTags = new WeakMap<Node, JSDocTagInfo[]>();

/**
 * Type literals, function expressions, ... in source files: TypeScript binds them to a symbol of their own. Nodes
 * synthesized by the checker do not have symbols.
 */
function isAnonymousDeclaration(node: Node): boolean {
    return hasExpressionSymbol(node) && !isSynthesizedNode(node);
}

/**
 * The type checker of a program, with the TypeScript 5 behaviour the generator relies on:
 * - symbols can be looked up for nodes synthesized by `typeToTypeNode`
 * - symbols can be looked up for declarations
 */
export class TypeChecker {
    public readonly checker: Checker;

    public constructor(public readonly program: Program) {
        this.checker = program.getProject().checker;
    }

    // Each checker call is a request to the TypeScript process, and the program does not change, so answers are cached.
    private readonly cache = new Map<string, WeakMap<object, { value: unknown }>>();

    private cached<K extends object, V>(name: string, key: K, compute: (key: K) => V): V {
        let map = this.cache.get(name);
        if (!map) {
            map = new WeakMap();
            this.cache.set(name, map);
        }
        let entry = map.get(key);
        if (!entry) {
            entry = { value: compute(key) };
            map.set(key, entry);
        }
        return entry.value as V;
    }

    private sourceFileNames: Set<string> | undefined;

    public hasSourceFileName(fileName: string): boolean {
        this.sourceFileNames ??= new Set(this.program.getSourceFileNames());
        return this.sourceFileNames.has(fileName);
    }

    public getSymbolAtLocation(node: Node): Symbol | undefined {
        return this.cached("getSymbolAtLocation", node, (n) =>
            isSynthesizedNode(n) ? this.getSymbolOfSynthesizedNode(n) : this.checker.getSymbolAtLocation(n),
        );
    }

    /**
     * Returns the symbol declared by a declaration (or a synthesized entity name).
     */
    public getSymbolOfNode(node: Node): Symbol | undefined {
        return this.cached("getSymbolOfNode", node, (n) => {
            this.prefetchMemberSymbols(n);
            return this.computeSymbolOfNode(n);
        });
    }

    /**
     * The symbols of members (e.g. properties) are usually all needed, so they are requested in a single request when
     * the first one is.
     */
    private prefetchMemberSymbols(node: Node): void {
        const members = (node.parent as { members?: readonly Node[] } | undefined)?.members;
        if (!members || members.length < 2 || isSynthesizedNode(node)) {
            return;
        }

        const symbols = this.cache.get("getSymbolAtLocation");
        const names = members
            .map((member) => getNameOfDeclaration(member as Declaration))
            .filter((name): name is DeclarationName => !!name && !symbols?.has(name));
        if (names.length < 2) {
            return;
        }

        const resolved = this.checker.getSymbolAtLocation(names);
        names.forEach((name, i) => this.cached("getSymbolAtLocation", name, () => resolved[i]));
    }

    private computeSymbolOfNode(node: Node): Symbol | undefined {
        if (isSynthesizedNode(node)) {
            return this.getSymbolOfSynthesizedNode(node);
        }

        if (node.kind === SyntaxKind.SourceFile) {
            return this.checker.getSymbolOfSourceFile((node as SourceFile).fileName);
        }

        // Function expressions, type literals, ... declare the (possibly anonymous) symbol of their type
        if (hasExpressionSymbol(node)) {
            return this.getTypeAtLocation(node).getSymbol();
        }

        const name =
            node.kind === SyntaxKind.Identifier || node.kind === SyntaxKind.QualifiedName
                ? node
                : getNameOfDeclaration(node as Declaration);
        if (name) {
            return this.getSymbolAtLocation(name);
        }

        // `export default function () {}`
        const defaultKeyword = (node as Declaration & { modifiers?: readonly Node[] }).modifiers?.find(
            (modifier) => modifier.kind === SyntaxKind.DefaultKeyword,
        );
        return defaultKeyword && this.getSymbolAtLocation(defaultKeyword);
    }

    public getTypeAtLocation(node: Node): Type {
        return this.cached("getTypeAtLocation", node, (n) => {
            // Synthesized nodes are not known to the checker
            if (isSynthesizedNode(n)) {
                return this.checker.getAnyType();
            }

            this.prefetchDeclarationTypes(n);
            return this.prefetchedTypes.get(n) ?? this.checker.getTypeAtLocation(n);
        });
    }

    /**
     * The types of type declarations (e.g. checked by PromiseNodeParser) are usually needed for several declarations of
     * a file, so they are requested in a single request when the first one is.
     */
    private prefetchDeclarationTypes(node: Node): void {
        const statements = (node.parent as { statements?: readonly Node[] } | undefined)?.statements;
        if (!statements || !isTypeDeclaration(node)) {
            return;
        }

        const types = this.cache.get("getTypeAtLocation");
        const declarations = statements.filter((statement) => isTypeDeclaration(statement) && !types?.has(statement));
        if (declarations.length < 2) {
            return;
        }

        const resolved = this.checker.getTypeAtLocation(declarations);
        declarations.forEach((declaration, i) => {
            if (declaration !== node) {
                this.cached("getTypeAtLocation", declaration, () => resolved[i]);
            }
        });
        this.prefetchedTypes.set(node, resolved[declarations.indexOf(node)]);
    }

    private readonly prefetchedTypes = new WeakMap<Node, Type>();

    public typeToTypeNode(
        type: Type,
        enclosingDeclaration: Node | undefined,
        flags: NodeBuilderFlags | undefined,
    ): TypeNode | undefined {
        if (enclosingDeclaration && isSynthesizedNode(enclosingDeclaration)) {
            enclosingDeclaration = synthesizedOrigins.get(enclosingDeclaration.getSourceFile())?.enclosingDeclaration;
        }

        const node = this.checker.typeToTypeNode(type, enclosingDeclaration, flags);
        if (node) {
            synthesizedOrigins.set(node, { checker: this, enclosingDeclaration });
        }

        return node;
    }

    public getAliasedSymbol(symbol: Symbol): Symbol {
        return this.cached("getAliasedSymbol", symbol, (s) => this.checker.getAliasedSymbol(s));
    }

    public getExportSpecifierLocalTargetSymbol(node: Node): Symbol | undefined {
        return this.checker.getExportSpecifierLocalTargetSymbol(node);
    }

    public getExportsOfModule(symbol: Symbol): readonly Symbol[] {
        return this.checker.getExportsOfModule(symbol);
    }

    public getFullyQualifiedName(symbol: Symbol): string {
        return this.cached("getFullyQualifiedName", symbol, (s) => this.checker.getFullyQualifiedName(s));
    }

    public getAwaitedType(type: Type): Type | undefined {
        return this.cached("getAwaitedType", type, (t) => this.checker.getAwaitedType(t));
    }

    /**
     * The type arguments of a type reference, or an empty array for other types.
     */
    public getTypeArguments(type: Type): readonly Type[] {
        return type.isTypeReference() ? this.checker.getTypeArguments(type) : [];
    }

    public isTypeAssignableTo(source: Type, target: Type): boolean {
        return this.checker.isTypeAssignableTo(source, target);
    }

    public getConstantValue(node: Node): string | number | undefined {
        return this.checker.getConstantValue(node);
    }

    public getSignatureFromDeclaration(node: Node) {
        return this.checker.getSignatureFromDeclaration(node);
    }

    public getReturnTypeOfSignature(signature: ReturnType<Checker["getSignatureFromDeclaration"]>): Type {
        return this.checker.getReturnTypeOfSignature(signature);
    }

    /**
     * Like `symbol.getDocumentationComment(checker)` in TypeScript 5, including documentation inherited from base
     * types.
     */
    public getDocumentationComment(symbol: Symbol): SymbolDisplayPart[] {
        let doc = this.documentationComments.get(symbol);
        if (!doc) {
            // Set temporarily to avoid an infinite loop finding inherited documentation
            this.documentationComments.set(symbol, []);
            doc = this.getDocumentationCommentOfDeclarations(getDeclarations(symbol));
            this.documentationComments.set(symbol, doc);
        }
        return doc;
    }

    private readonly documentationComments = new WeakMap<Symbol, SymbolDisplayPart[]>();

    /**
     * The documentation comment of the symbol a node declares, or undefined if it declares none. Anonymous declarations
     * are the only declaration of their symbol, so they do not need a request to the checker.
     */
    public getDocumentationCommentOfNode(node: Node): SymbolDisplayPart[] | undefined {
        if (isAnonymousDeclaration(node)) {
            return this.cached("getDocumentationCommentOfNode", node, (n) =>
                this.getDocumentationCommentOfDeclarations([n as Declaration]),
            );
        }

        const symbol = this.getSymbolOfNode(node);
        return symbol && this.getDocumentationComment(symbol);
    }

    private getDocumentationCommentOfDeclarations(declarations: readonly Declaration[]): SymbolDisplayPart[] {
        let doc = getJsDocCommentsFromDeclarations(declarations, this);
        if (doc.length === 0 || declarations.some(hasJSDocInheritDocTag)) {
            const seenSymbols = new Set<Symbol>();
            for (const declaration of declarations) {
                const inheritedDocs = this.findBaseOfDeclaration(declaration, (symbol) => {
                    if (seenSymbols.has(symbol)) {
                        return undefined;
                    }
                    seenSymbols.add(symbol);
                    return this.getDocumentationComment(symbol);
                });
                if (inheritedDocs) {
                    doc = doc.length === 0 ? inheritedDocs.slice() : inheritedDocs.concat(lineBreakPart(), doc);
                }
            }
        }
        return doc;
    }

    private findBaseOfDeclaration<T>(declaration: Declaration, cb: (symbol: Symbol) => T | undefined): T | undefined {
        const classOrInterfaceDeclaration =
            declaration.parent?.kind === SyntaxKind.Constructor ? declaration.parent.parent : declaration.parent;
        const superTypeNodes = classOrInterfaceDeclaration ? getAllSuperTypeNodes(classOrInterfaceDeclaration) : [];
        const symbol = superTypeNodes.length ? this.getSymbolOfNode(declaration) : undefined;
        if (!symbol) {
            return undefined;
        }

        const isStaticMember = !!(getCombinedModifierFlags(declaration) & ModifierFlags.Static);
        for (const superTypeNode of superTypeNodes) {
            const baseType = this.checker.getTypeAtLocation(superTypeNode);
            const baseSymbol = baseType.getSymbol();
            const type = isStaticMember && baseSymbol ? this.checker.getTypeOfSymbol(baseSymbol) : baseType;
            const property = this.checker.getPropertyOfType(type, symbol.name);
            const result = property ? cb(property) : undefined;
            if (result !== undefined) {
                return result;
            }
        }
        return undefined;
    }

    /**
     * Like `getSymbolTarget` in TypeScript 5: follows aliases.
     */
    public getSymbolTarget(symbol: Symbol): Symbol {
        return symbol.flags & SymbolFlags.Alias ? this.checker.getAliasedSymbol(symbol) : symbol;
    }

    /**
     * Synthesized nodes are not known to the checker. The names they contain are resolvable from the location they
     * were created for, so they are resolved by name.
     */
    protected getSymbolOfSynthesizedNode(node: Node): Symbol | undefined {
        const enclosingDeclaration = synthesizedOrigins.get(node.getSourceFile())?.enclosingDeclaration;

        switch (node.kind) {
            case SyntaxKind.Identifier:
            case SyntaxKind.QualifiedName:
            case SyntaxKind.PropertyAccessExpression:
                return this.resolveEntityName(node as EntityName, enclosingDeclaration);
            case SyntaxKind.ImportType:
                return this.resolveImportType(node as ImportTypeNode, enclosingDeclaration);
            default:
                return undefined;
        }
    }

    protected resolveEntityName(node: EntityName | Expression, location: Node | undefined): Symbol | undefined {
        if (node.kind === SyntaxKind.Identifier) {
            // Synthesized trees refer to the same names many times
            const text = (node as Identifier).text;
            const names = this.cached("resolveName", location ?? this, () => new Map<string, Symbol | undefined>());
            if (!names.has(text)) {
                names.set(
                    text,
                    this.checker.resolveName(
                        text,
                        SymbolFlags.Type | SymbolFlags.Value | SymbolFlags.Namespace | SymbolFlags.Alias,
                        location,
                    ),
                );
            }
            return names.get(text);
        }

        let left: Node;
        let right: Identifier;
        if (node.kind === SyntaxKind.QualifiedName) {
            ({ left, right } = node as unknown as { left: Node; right: Identifier });
        } else if (node.kind === SyntaxKind.PropertyAccessExpression) {
            ({ expression: left, name: right } = node as unknown as { expression: Node; name: Identifier });
        } else {
            return undefined;
        }

        let namespace = this.resolveEntityName(left as EntityName, location);
        if (!namespace) {
            return undefined;
        }
        if (namespace.flags & SymbolFlags.Alias) {
            namespace = this.checker.getAliasedSymbol(namespace);
        }

        return (
            this.checker.getMemberInModuleExports(namespace, right.text) ??
            namespace.getExports().get(right.text as never) ??
            namespace.getMembers().get(right.text as never)
        );
    }

    protected resolveImportType(node: ImportTypeNode, location: Node | undefined): Symbol | undefined {
        const argument = node.argument as Node & { literal?: { text: string } };
        const moduleName = argument.literal?.text;
        const containingFile = location ? getSourceFileOfNode(location) : undefined;
        if (!moduleName) {
            return undefined;
        }

        const mode = containingFile && this.program.getSourceFileMetadata(containingFile.fileName)?.impliedNodeFormat;
        const fileName =
            containingFile && mode !== undefined
                ? (this.program.getResolvedModule(containingFile.fileName, moduleName, mode)?.resolvedFileName ??
                  moduleName)
                : moduleName;

        let symbol: Symbol | undefined = this.checker.getSymbolOfSourceFile(fileName);
        if (!symbol) {
            return undefined;
        }

        if (node.qualifier) {
            const names: string[] = [];
            let qualifier: Node = node.qualifier;
            while (qualifier.kind === SyntaxKind.QualifiedName) {
                const { left, right } = qualifier as unknown as { left: Node; right: Identifier };
                names.unshift(right.text);
                qualifier = left;
            }
            names.unshift((qualifier as Identifier).text);

            for (const name of names) {
                symbol = symbol && this.checker.getMemberInModuleExports(symbol, name);
            }
        }

        return symbol;
    }
}

/**
 * Nodes whose symbol is the symbol of their type, which TypeScript binds as an anonymous symbol (e.g. `__type`,
 * `__function`, `__object`) or after the name of the expression.
 */
function hasExpressionSymbol(node: Node): boolean {
    switch (node.kind) {
        case SyntaxKind.TypeLiteral:
        case SyntaxKind.MappedType:
        case SyntaxKind.ObjectLiteralExpression:
        case SyntaxKind.FunctionExpression:
        case SyntaxKind.ArrowFunction:
        case SyntaxKind.ClassExpression:
        case SyntaxKind.FunctionType:
        case SyntaxKind.ConstructorType:
            return true;
        default:
            return false;
    }
}

// JSDoc as read by TypeScript 5. TypeScript 7 renders `{@link}` tags differently in documentation comments and no
// longer treats `@` that is not followed by a tag name as the start of a tag, so this follows the TypeScript 5
// language service to keep the generated schemas unchanged.

/** A part of a documentation comment, as in the TypeScript 5 API. */
export interface SymbolDisplayPart {
    text: string;
    kind: string;
}

/** A JSDoc tag of a symbol, as in the TypeScript 5 API. */
export interface JSDocTagInfo {
    name: string;
    text?: SymbolDisplayPart[];
}

/** A tag TypeScript 5 parsed out of `@` that is not followed by a tag name, e.g. `@@hidden`. */
interface TextTag {
    kind: SyntaxKind.JSDocUnknownTag;
    tagName: { text: string };
    comment: readonly JSDocComment[] | undefined;
}

type Tag = JSDocTag | TextTag;

function displayPart(text: string, kind: string): SymbolDisplayPart {
    return { text, kind };
}

function textPart(text: string) {
    return displayPart(text, "text");
}

function lineBreakPart() {
    return displayPart("\n", "lineBreak");
}

function getAllSuperTypeNodes(node: Node): readonly Node[] {
    const heritageClauses = (node as { heritageClauses?: readonly { types: readonly Node[] }[] }).heritageClauses;
    return heritageClauses?.flatMap((clause) => clause.types) ?? [];
}

function hasJSDocInheritDocTag(node: Node): boolean {
    return getJSDocTags(node).some((tag) => tag.tagName.text === "inheritDoc" || tag.tagName.text === "inheritdoc");
}

/**
 * Splits a comment where TypeScript 5 started tags that TypeScript 7 keeps as text: at the beginning of a line, `@`
 * followed by something else than a tag name.
 */
function splitTextTags(comment: readonly JSDocComment[] | undefined): {
    comment: readonly JSDocComment[] | undefined;
    tags: TextTag[];
} {
    // TypeScript 5 did not have empty comments
    if (!comment?.some((part) => part.kind !== SyntaxKind.JSDocText || part.text)) {
        return { comment: undefined, tags: [] };
    }

    const index = comment.findIndex((part) => part.kind === SyntaxKind.JSDocText && textTagStart.test(part.text));
    if (index < 0) {
        return { comment, tags: [] };
    }

    const part = comment[index];
    const match = textTagStart.exec(part.text)!;
    const before = part.text.slice(0, match.index).trimEnd();
    const head = [...comment.slice(0, index), ...(before ? [jsDocText(before)] : [])];

    let rest = part.text.slice(match.index + match[0].length - 1);
    const tags: TextTag[] = [];
    for (;;) {
        // `rest` starts with `@`
        const name = /^@([A-Za-z_$][\w$]*)?/.exec(rest)![1] ?? "";
        rest = rest.slice(name.length + 1);
        if (rest.startsWith("@")) {
            tags.push({ kind: SyntaxKind.JSDocUnknownTag, tagName: { text: name }, comment: undefined });
            continue;
        }
        const text = rest.trim();
        const tail = comment.slice(index + 1);
        tags.push({
            kind: SyntaxKind.JSDocUnknownTag,
            tagName: { text: name },
            comment: text || tail.length ? [jsDocText(text), ...tail] : undefined,
        });
        break;
    }

    return { comment: head.length ? head : undefined, tags };
}

function jsDocText(text: string): JSDocComment {
    return { kind: SyntaxKind.JSDocText, text } as JSDocComment;
}

const textTagStart = /(?:^|\n)[ \t]*@(?![A-Za-z_$])/;

/**
 * Like `getJSDocTags` in TypeScript 5.
 */
function getJSDocTags(node: Node): Tag[] {
    return getJSDocCommentsAndTags(node).flatMap((jsDocOrTag): Tag[] => {
        if (jsDocOrTag.kind === SyntaxKind.JSDoc) {
            const jsDoc = jsDocOrTag as JSDoc;
            return [...splitTextTags(jsDoc.comment).tags, ...(jsDoc.tags ?? []).flatMap(withTextTags)];
        }
        return withTextTags(jsDocOrTag);
    });
}

function withTextTags(tag: JSDocTag): Tag[] {
    const { comment, tags } = splitTextTags(tag.comment);
    if (comment === tag.comment) {
        return [tag];
    }

    // Keep the prototype of the node for its methods
    const tagWithoutTextTags = Object.create(tag, { comment: { value: comment } }) as Tag;
    return [tagWithoutTextTags, ...tags];
}

function getCommentOf(jsDocOrTag: JSDoc | JSDocTag): readonly JSDocComment[] | undefined {
    return splitTextTags(jsDocOrTag.comment).comment;
}

function getJsDocTagsFromDeclarations(declarations: readonly Declaration[], checker?: TypeChecker): JSDocTagInfo[] {
    const infos: JSDocTagInfo[] = [];
    for (const declaration of new Set(declarations)) {
        const tags = getJSDocTags(declaration);
        if (
            tags.some((t) => t.kind === SyntaxKind.JSDocTypedefTag || t.kind === SyntaxKind.JSDocCallbackTag) &&
            !tags.some((t) => t.kind === SyntaxKind.JSDocParameterTag || t.kind === SyntaxKind.JSDocReturnTag)
        ) {
            continue;
        }
        for (const tag of tags) {
            infos.push({ name: tag.tagName.text, text: getCommentDisplayParts(tag, checker) });
            infos.push(...getJSDocPropertyTagsInfo(tryGetJSDocPropertyTags(tag), checker));
        }
    }
    return infos;
}

function getJSDocPropertyTagsInfo(nodes: readonly Tag[] | undefined, checker?: TypeChecker): JSDocTagInfo[] {
    return (nodes ?? []).flatMap((propTag) => [
        { name: propTag.tagName.text, text: getCommentDisplayParts(propTag, checker) },
        ...getJSDocPropertyTagsInfo(tryGetJSDocPropertyTags(propTag), checker),
    ]);
}

function tryGetJSDocPropertyTags(node: Tag): readonly Tag[] | undefined {
    if (node.kind !== SyntaxKind.JSDocPropertyTag && node.kind !== SyntaxKind.JSDocParameterTag) {
        return undefined;
    }
    const { isNameFirst, typeExpression } = node as unknown as {
        isNameFirst: boolean;
        typeExpression?: { type?: Node };
    };
    const type = typeExpression?.type as { kind: SyntaxKind; jsdocPropertyTags?: readonly Tag[] } | undefined;
    return isNameFirst && type?.kind === SyntaxKind.JSDocTypeLiteral ? type.jsdocPropertyTags : undefined;
}

function getCommentDisplayParts(tag: Tag, checker?: TypeChecker): SymbolDisplayPart[] | undefined {
    const comment = tag.comment;
    const fromComment = () => (comment === undefined ? undefined : getDisplayPartsFromComment(comment, checker));
    const withNode = (node: Node) => addComment(node.getText());
    const addComment = (s: string) => {
        if (comment) {
            if (/^https?$/.test(s)) {
                return [textPart(s), ...getDisplayPartsFromComment(comment, checker)];
            }
            return [textPart(s), displayPart(" ", "space"), ...getDisplayPartsFromComment(comment, checker)];
        }
        return [textPart(s)];
    };
    const fields = tag as unknown as Record<string, Node | undefined> & { typeParameters?: readonly Node[] };

    switch (tag.kind) {
        case SyntaxKind.JSDocThrowsTag:
            return fields.typeExpression ? withNode(fields.typeExpression) : fromComment();
        case SyntaxKind.JSDocImplementsTag:
        case SyntaxKind.JSDocAugmentsTag:
            return withNode(fields.className!);
        case SyntaxKind.JSDocTemplateTag: {
            const displayParts: SymbolDisplayPart[] = [];
            if (fields.constraint) {
                displayParts.push(textPart(fields.constraint.getText()));
            }
            const typeParameters = fields.typeParameters ?? [];
            if (typeParameters.length) {
                if (displayParts.length) {
                    displayParts.push(displayPart(" ", "space"));
                }
                typeParameters.forEach((tp, i) => {
                    displayParts.push(displayPart(tp.getText(), "typeParameterName"));
                    if (i < typeParameters.length - 1) {
                        displayParts.push(displayPart(",", "punctuation"), displayPart(" ", "space"));
                    }
                });
            }
            if (comment) {
                displayParts.push(displayPart(" ", "space"), ...getDisplayPartsFromComment(comment, checker));
            }
            return displayParts;
        }
        case SyntaxKind.JSDocTypeTag:
        case SyntaxKind.JSDocSatisfiesTag:
            return withNode(fields.typeExpression!);
        case SyntaxKind.JSDocTypedefTag:
        case SyntaxKind.JSDocCallbackTag:
        case SyntaxKind.JSDocPropertyTag:
        case SyntaxKind.JSDocParameterTag:
        case SyntaxKind.JSDocSeeTag: {
            const name = tag.kind === SyntaxKind.JSDocSeeTag ? fields.nameExpression : fields.name;
            return name ? withNode(name) : fromComment();
        }
        default:
            return fromComment();
    }
}

function getJsDocCommentsFromDeclarations(
    declarations: readonly Declaration[],
    checker?: TypeChecker,
): SymbolDisplayPart[] {
    const parts: SymbolDisplayPart[][] = [];
    for (const declaration of new Set(declarations)) {
        for (const jsDoc of getCommentHavingNodes(declaration)) {
            const comment = getCommentOf(jsDoc);
            const tags = jsDoc.kind === SyntaxKind.JSDoc ? (jsDoc as JSDoc).tags : undefined;
            const inheritDoc = tags?.find(
                (t) =>
                    t.kind === SyntaxKind.JSDocUnknownTag &&
                    (t.tagName.text === "inheritDoc" || t.tagName.text === "inheritdoc"),
            );
            if (
                (comment === undefined && !inheritDoc) ||
                (jsDoc.kind === SyntaxKind.JSDoc &&
                    declaration.kind !== SyntaxKind.JSDocTypedefTag &&
                    declaration.kind !== SyntaxKind.JSDocCallbackTag &&
                    tags?.some(
                        (t) => t.kind === SyntaxKind.JSDocTypedefTag || t.kind === SyntaxKind.JSDocCallbackTag,
                    ) &&
                    !tags.some((t) => t.kind === SyntaxKind.JSDocParameterTag || t.kind === SyntaxKind.JSDocReturnTag))
            ) {
                continue;
            }
            let newParts = comment ? getDisplayPartsFromComment(comment, checker) : [];
            if (inheritDoc?.comment) {
                newParts = newParts.concat(getDisplayPartsFromComment(inheritDoc.comment, checker));
            }
            if (!parts.some((p) => isIdenticalListOfDisplayParts(p, newParts))) {
                parts.push(newParts);
            }
        }
    }
    return parts.flatMap((p, i) => (i ? [lineBreakPart(), ...p] : p));
}

function getCommentHavingNodes(declaration: Declaration): readonly (JSDoc | JSDocTag)[] {
    switch (declaration.kind) {
        case SyntaxKind.JSDocParameterTag:
        case SyntaxKind.JSDocPropertyTag:
            return [declaration as unknown as JSDocTag];
        case SyntaxKind.JSDocCallbackTag:
        case SyntaxKind.JSDocTypedefTag:
            return [declaration as unknown as JSDocTag, declaration.parent as JSDoc];
        default:
            return getJSDocCommentsAndTags(declaration);
    }
}

function isIdenticalListOfDisplayParts(a: SymbolDisplayPart[], b: SymbolDisplayPart[]): boolean {
    return a.length === b.length && a.every((part, i) => part.text === b[i].text && part.kind === b[i].kind);
}

/**
 * TypeScript 5 kept comments without links as a single string, and comments with links as text and links where each
 * link follows a (possibly empty) text.
 */
function getDisplayPartsFromComment(comment: readonly JSDocComment[], checker?: TypeChecker): SymbolDisplayPart[] {
    if (!comment.some((part) => part.kind !== SyntaxKind.JSDocText)) {
        return [textPart(comment.map((part) => part.text).join(""))];
    }

    const parts: SymbolDisplayPart[] = [];
    let text: string | undefined;
    for (const part of comment) {
        if (part.kind === SyntaxKind.JSDocText) {
            text = (text ?? "") + part.text;
        } else {
            parts.push(textPart(text ?? ""), ...buildLinkParts(part as JSDocLink, checker));
            text = undefined;
        }
    }
    if (text) {
        parts.push(textPart(text));
    }
    return parts;
}

function buildLinkParts(link: JSDocLink, checker?: TypeChecker): SymbolDisplayPart[] {
    const prefix =
        link.kind === SyntaxKind.JSDocLink ? "link" : link.kind === SyntaxKind.JSDocLinkCode ? "linkcode" : "linkplain";
    const parts = [displayPart(`{@${prefix} `, "link")];
    if (!link.name) {
        if (link.text) {
            parts.push(displayPart(link.text, "linkText"));
        }
    } else {
        const symbol = checker?.checker.getSymbolAtLocation(link.name);
        const targetSymbol = symbol && checker ? checker.getSymbolTarget(symbol) : undefined;
        const suffix = findLinkNameEnd(link.text);
        const name = link.name.getText() + link.text.slice(0, suffix);
        const text = skipSeparatorFromLinkText(link.text.slice(suffix));
        const decl = targetSymbol && (targetSymbol.valueDeclaration ?? targetSymbol.declarations[0]);
        if (decl) {
            parts.push(displayPart(name, "linkName"));
            if (text) {
                parts.push(displayPart(text, "linkText"));
            }
        } else {
            const separator =
                suffix === 0 || (link.text.charAt(suffix) === "|" && name.charAt(name.length - 1) !== " ") ? " " : "";
            parts.push(displayPart(name + separator + text, "linkText"));
        }
    }
    parts.push(displayPart("}", "link"));
    return parts;
}

function skipSeparatorFromLinkText(text: string): string {
    let pos = 0;
    if (text.charAt(pos++) === "|") {
        while (pos < text.length && text.charAt(pos) === " ") {
            pos++;
        }
        return text.slice(pos);
    }
    return text;
}

function findLinkNameEnd(text: string): number {
    let pos = text.indexOf("://");
    if (pos === 0) {
        while (pos < text.length && text.charAt(pos) !== "|") {
            pos++;
        }
        return pos;
    }
    if (text.indexOf("()") === 0) {
        return 2;
    }
    if (text.charAt(0) === "<") {
        let brackets = 0;
        let i = 0;
        while (i < text.length) {
            if (text[i] === "<") {
                brackets++;
            }
            if (text[i] === ">") {
                brackets--;
            }
            i++;
            if (!brackets) {
                return i;
            }
        }
    }
    return 0;
}

function isTypeDeclaration(node: Node): boolean {
    switch (node.kind) {
        case SyntaxKind.InterfaceDeclaration:
        case SyntaxKind.ClassDeclaration:
        case SyntaxKind.TypeAliasDeclaration:
            return true;
        default:
            return false;
    }
}
