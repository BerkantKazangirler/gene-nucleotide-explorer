import { useState, type FormEvent } from "react";

const ORGANISMS = [
  { value: "", label: "Tüm türler" },
  { value: "Homo sapiens", label: "Homo sapiens" },
  { value: "Mus musculus", label: "Mus musculus" },
];

interface Props {
  query: string;
  organism: string;
  onHome: () => void;
  onSearch: (q: string, organism: string) => void;
}

export const Navbar = ({ query, organism, onHome, onSearch }: Props) => {
  const [text, setText] = useState(query);
  const [org, setOrg] = useState(organism);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    if (q) onSearch(q, org);
  };

  return (
    <header className="border-b border-line bg-paper">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center gap-x-8 gap-y-2">
        <button onClick={onHome} className="font-bold text-[17px] whitespace-nowrap">
          Gene Nucleotide Explorer
        </button>
        <form onSubmit={submit} role="search" className="flex flex-1 min-w-[280px] max-w-2xl">
          <label className="sr-only" htmlFor="q">
            Gen sembolü veya Gene ID
          </label>
          <input
            id="q"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Gen sembolü veya Gene ID, ör. MEFV"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 min-w-0 h-9 border border-line border-r-0 rounded-l px-3 bg-paper focus:outline-none focus:border-base-c"
          />
          <label className="sr-only" htmlFor="organism">
            Tür
          </label>
          <select
            id="organism"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            className="h-9 border border-line border-r-0 px-2 bg-sheet text-sm"
          >
            {ORGANISMS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button className="h-9 px-4 rounded-r bg-ink text-paper text-sm font-semibold hover:bg-base-c">Ara</button>
        </form>
      </div>
    </header>
  );
};
