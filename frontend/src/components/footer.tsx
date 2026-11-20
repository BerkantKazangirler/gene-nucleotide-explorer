export const Footer = () => {
  return (
    <footer className="border-t border-line text-sm text-ink-soft">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row gap-2 justify-between">
        <span>&copy; 2026 ReFinder. TÜBİTAK 2209-A, Karabük Üniversitesi.</span>
        <span>
          Veriler{" "}
          <a className="underline underline-offset-2" href="https://www.ncbi.nlm.nih.gov/gene" target="_blank" rel="noreferrer">
            NCBI Gene
          </a>{" "}
          ve REBASE kaynaklıdır.
        </span>
      </div>
    </footer>
  );
};
