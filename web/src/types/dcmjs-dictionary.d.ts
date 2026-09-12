declare module 'dcmjs/dictionary' {
  export interface DictionaryEntry {
    tag: string
    vr: string
    vm: string
    name: string
    version?: string
  }
  export const dictionary: Record<string, DictionaryEntry>
  export default dictionary
}
