// Types only, so client code can import them without pulling in the server-side Yahoo library.
export interface SearchHit {
  symbol: string;
  name: string;
  exch: string;
  type: string;
}
