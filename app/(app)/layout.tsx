import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        {children}
      </div>
    </div>
  );
}
