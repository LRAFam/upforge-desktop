import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

/** Read the production implementation, normalizing only line endings and factory indentation. */
export function readMainRuntimeSource(...files: string[]): string {
  return files.map(file => {
    const source = readFileSync(join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n')
    return file === 'index.ts' ? source : source.replace(/^  /gm, '')
  }).join('\n')
}

/** Compile selected production functions for isolated main-process tests without booting Electron. */
export function compileMainRuntimeFunctions(file: string, names: string[]): string {
  const source = ts.createSourceFile(file, readMainRuntimeSource(file), ts.ScriptTarget.Latest, true)
  const selected: string[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? '')) selected.push(node.getText(source))
    else ts.forEachChild(node, visit)
  }
  visit(source)
  if (selected.length !== names.length) throw new Error(`Missing production function in ${file}`)
  return ts.transpileModule(selected.join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
}
