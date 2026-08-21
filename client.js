// Coursekeeper web client: a small button in the session header that opens a
// quick menu and submits the corresponding /coursekeeper command through the
// composer input actions. Kept dependency-light (React only).
window.__ModuleLoader__.load({
  id: '@orangeofcarl0-sys/dsh-coursekeeper',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    const react = require('react');
    const { useState } = react;

    const styles = {
      wrap: { position: 'relative', display: 'inline-flex', alignItems: 'center' },
      button: {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        height: 24, padding: '0 8px', borderRadius: 6, border: '1px solid #3d3f4b',
        background: '#26283a', color: '#cdd1e0', fontSize: 12, cursor: 'pointer',
      },
      menu: {
        position: 'absolute', top: 28, right: 0, zIndex: 50, minWidth: 180,
        background: '#1f2130', border: '1px solid #3d3f4b', borderRadius: 8,
        padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,.45)', display: 'flex',
        flexDirection: 'column', gap: 4, textAlign: 'left',
      },
      item: {
        padding: '6px 10px', borderRadius: 6, border: 'none', background: 'transparent',
        color: '#e4e7f2', fontSize: 12, cursor: 'pointer', textAlign: 'left',
      },
      itemHover: { background: '#2c2f44' },
      hint: { padding: '2px 10px 4px', color: '#8a8fa3', fontSize: 11, whiteSpace: 'nowrap' },
    };

    function CoursekeeperAction(props) {
      const inputActions = props && props.inputActions;
      const [open, setOpen] = useState(false);
      if (!inputActions) return null;
      const run = (line) => {
        try {
          inputActions.setDraft(line);
          inputActions.submit();
        } finally {
          setOpen(false);
        }
      };
      const item = (label, line) => react.createElement(
        'button',
        { key: line, style: styles.item, onClick: () => run(line), onMouseEnter: (e) => { e.currentTarget.style.background = styles.itemHover.background; }, onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; } },
        label,
      );
      return react.createElement(
        'div',
        { style: styles.wrap },
        react.createElement('button', { style: styles.button, title: 'Coursekeeper 控制', onClick: () => setOpen(!open) }, 'CK'),
        open ? react.createElement(
          'div',
          { style: styles.menu },
          item('查看状态', '/coursekeeper status'),
          item('启用本会话', '/coursekeeper on'),
          item('关闭本会话', '/coursekeeper off'),
          item('仅观察（不拦截）', '/coursekeeper shadow'),
          item('允许跳过硬语义验证', '/coursekeeper verifier allow'),
          item('清理过期债务', '/coursekeeper cleanup'),
          item('帮助', '/coursekeeper help'),
          react.createElement('div', { style: styles.hint }, '点击会将命令投递到当前会话'),
        ) : null,
      );
    }

    exports.inject = ['slots'];
    exports.apply = function apply(ctx) {
      ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions',
        id: 'coursekeeper',
        order: 100,
        label: 'Coursekeeper',
      }, CoursekeeperAction));
    };
    return module.exports;
  },
});
