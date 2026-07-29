type Props = {
  title: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export default function Panel({ title, actions, children }: Props) {
  return (
    <div className="panel">
      <div className="panel-header drag-handle">
        <div className="panel-title">{title}</div>
        <div className="panel-actions">{actions}</div>
      </div>
      <div className="panel-body">{children}</div>
      <style>{`
        .panel { height:100%; display:flex; flex-direction:column; border:1px solid #e5e7eb; border-radius:10px; overflow:hidden; background:#fff; }
        .panel-header { display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-bottom:1px solid #e5e7eb; background:#fafafa; }
        .panel-title { font-size:14px; font-weight:600; }
        .panel-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .panel-actions :where(button){ font-size:12px; }
        .drag-handle { cursor:move; }

        .panel-body {
          flex:1; min-height:0; overflow:hidden; position:relative;
          display:flex;
        }
        .panel-body > * {
          flex:1; min-height:0; /* child fills the whole panel body */
        }
      `}</style>
    </div>
  );
}