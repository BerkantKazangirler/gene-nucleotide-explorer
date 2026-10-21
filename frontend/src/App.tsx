import { Footer } from "./components/footer";
import { Navbar } from "./components/navbar";

function App() {
  return (
    <div className="w-screen h-screen justify-between flex flex-col">
      <Navbar />
      <span>Test</span>
      <Footer />
    </div>
  );
}

export default App;
