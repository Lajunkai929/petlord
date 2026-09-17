import { Button } from "@petlord/ui";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { ArrowClockwise, Bug, WarningCircle } from "@phosphor-icons/react";
import { reportRuntimeError } from "../runtimeDiagnostics";

export class RuntimeErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportRuntimeError(new Error(`${error.message}\n${info.componentStack}`), "react-boundary");
  }

  async exportDiagnostics() {
    await window.petLordDesktop?.exportDiagnostics?.();
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="runtime-crash-screen">
        <WarningCircle size={38} weight="fill" />
        <span>桌面宠物遇到问题</span>
        <h1>可以恢复，不会丢失宠物包。</h1>
        <p>{this.state.error.message}</p>
        <div><Button type="default" htmlType="button" onClick={() => window.location.reload()}><ArrowClockwise size={15} />重新加载</Button><Button type="default" htmlType="button" onClick={() => this.exportDiagnostics()}><Bug size={15} />导出诊断报告</Button></div>
      </main>
    );
  }
}
