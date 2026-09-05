import Application from "@/components/application/Application";

export default function InternalLayout({ children }: { children: React.ReactNode }) {
  void children;
  return <Application />;
}
