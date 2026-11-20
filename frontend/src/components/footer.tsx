export const Footer = () => {
  return (
    <footer className="border-t border-line bg-sheet text-[13px] text-ink-soft">
      <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row gap-1 justify-between">
        <span>gene-nucleotide-explorer, TÜBİTAK 2209-A, Karabük Üniversitesi</span>
        <span>
          Veri kaynakları:{" "}
          <a href="https://www.ncbi.nlm.nih.gov/gene" target="_blank" rel="noreferrer">
            NCBI Gene
          </a>
          ,{" "}
          <a href="http://rebase.neb.com" target="_blank" rel="noreferrer">
            REBASE
          </a>
        </span>
      </div>
    </footer>
  );
};
