import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import UserMenu from "../components/UserMenu";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center">
          <div className="flex-1">
            <TopBar />
          </div>
          <div className="px-4 shrink-0 flex items-center h-14 border-b" style={{ borderColor: "var(--border)", background: "var(--sidebar)" }}>
            <UserMenu />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
