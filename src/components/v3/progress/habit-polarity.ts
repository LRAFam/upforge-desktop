/**
 * Is a "What keeps coming up" row a risk to fix, a strength, or neither? The knowledge bank has no
 * polarity column, so this mirrors the API's KnowledgeBankPraiseDetector (strict: praise words and
 * no problem, contrast or fix language anywhere), plus a few clear good-outcome phrases
 * ("turns fights into kills") that carry no praise adjective.
 */
export type HabitPolarity = 'risk' | 'strength' | 'neutral'

const PRAISE = /\b(strengths?|strong|excellent|great|good|solid|impressive|disciplined|smart|sharp|clean|effective|reliable|well)\b/iu
/** Good outcomes said without a praise word. */
const GOOD_OUTCOME = /\b(turn(?:s|ed|ing)?|convert(?:s|ed|ing)?)\b[^.]{0,60}\binto (?:kills|wins|round wins|multi-?kills|picks)\b|\b(?:pays?|paid) off\b|\bwins? (?:most|the majority) of\b/iu
const PROBLEM = /\b(but|however|although|though|yet|despite|except|while|unless|even|too|late|early|miss(?:es|ed|ing)?|fails?|failed|failing|should|instead|without|poor(?:ly)?|not|no|never|lacks?|lacking|los(?:e|es|ing|t)|loss|dies|dying|died|death|deaths|dead|caught|untraded|whiff\w*|overpeek\w*|over-?\w+|under-?\w+|habit of|tends? to|struggles?|forgets?|rarely|seldom|predictable|exposed|isolated|alone|risky|greedy|passive|aggressive\w*|needs?|wrong|mistakes?|bad|weak(?:ness)?|issues?|problems?|avoid|stop|try|work on|focus on|practi[cs]e|improve\w*|could|would|must|can|more|less|better|worse|only|little|few|low|slow|hard|cost\w*|punish\w*|panic\w*|ignor\w*|drops?|wast\w*|inconsistent\w*|unreliable)\b|n['’]t\b|\?/iu

/** True when the text clearly describes something going well and nothing to fix. */
export function isStrengthText(text: string): boolean {
  const t = text.trim().replace(/\s+/g, ' ')
  if (!t) return false
  return (PRAISE.test(t) || GOOD_OUTCOME.test(t)) && !PROBLEM.test(t)
}

/**
 * Polarity of one row from its label and the coach's note. A label that names a problem
 * ("Untraded deaths") keeps the row a risk whatever the note says; severity "info" is neutral.
 */
export function habitPolarity(r: { label: string | null; note: string; severity?: string | null }): HabitPolarity {
  if (r.label && PROBLEM.test(r.label)) return 'risk'
  if (isStrengthText(r.note)) return 'strength'
  if (r.severity === 'info') return 'neutral'
  return 'risk'
}
