import { describe, expect, it } from 'vitest'
import { applyAmountKey as applyKey } from './format'

const type = (keys: string[]) => keys.reduce((v, k) => applyKey(v, k), '')

describe('amount keypad', () => {
  it('types an amount', () => expect(type(['4', ',', '6'])).toBe('4,6'))
  it('leading comma becomes 0,', () => expect(type([',', '5'])).toBe('0,5'))
  it('max two decimals, one comma', () => expect(type(['1', ',', '2', '3', '4', ','])).toBe('1,23'))
  it('no leading zeros', () => expect(type(['0', '0', '7'])).toBe('7'))
  it('delete', () => expect(type(['1', '2', 'del'])).toBe('1'))
  it('caps integer digits', () => expect(type(['9', '9', '9', '9', '9', '9', '9'])).toBe('999999'))
})
