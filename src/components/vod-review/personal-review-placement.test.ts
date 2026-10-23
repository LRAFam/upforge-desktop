import { readFileSync } from 'node:fs'
import { baseParse, parserOptions, NodeTypes, type ElementNode, type TemplateChildNode } from '@vue/compiler-dom'
import { parse } from '@vue/compiler-sfc'
import { expect, it } from 'vitest'

it('keeps one personal notebook mounted in the review rail without map or analysis gates', () => {
  const source = readFileSync(new URL('./VodReviewBody.vue', import.meta.url), 'utf8')
  const template = parse(source).descriptor.template!.content
  const matches: ElementNode[][] = []
  function visit(nodes: TemplateChildNode[], parents: ElementNode[] = []) {
    for (const node of nodes) {
      if (node.type !== NodeTypes.ELEMENT) continue
      if (node.tag === 'VodPersonalReview') matches.push([...parents, node])
      visit(node.children, [...parents, node])
    }
  }
  visit(baseParse(template, parserOptions).children)
  expect(matches).toHaveLength(1)
  const ancestors = matches[0]
  expect(ancestors.some(node => node.props.some(prop => prop.type === NodeTypes.ATTRIBUTE && prop.name === 'class' && prop.value?.content.includes('vod-notes-panel')))).toBe(true)
  // Hiding the rail must retain the same component so an unsaved note survives map/theater toggles.
  expect(ancestors.flatMap(node => node.props).filter(prop => prop.type === NodeTypes.DIRECTIVE && ['if', 'else-if'].includes(prop.name))).toEqual([])
})
