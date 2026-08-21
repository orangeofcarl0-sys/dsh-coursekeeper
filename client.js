// Coursekeeper web client: a small button in the session header that opens a
// quick menu and submits the corresponding /coursekeeper command through the
// composer input actions. Kept dependency-light (React only).
window.__ModuleLoader__.load({
  id: '@orangeofcarl0-sys/dsh-coursekeeper',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    const react = require('react');
    const { useState, useEffect } = react;

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
      const sessionId = props && props.sessionId;
      const ckApi = props && props.ckApi;
      const [open, setOpen] = useState(false);
      const [modeLabel, setModeLabel] = useState('');
      useEffect(() => {
        if (!ckApi || !sessionId) return;
        ckApi.status(sessionId).then((s) => { if (s && s.userMode) setModeLabel(s.userMode); }).catch(() => {});
      }, [ckApi, sessionId]);
      const modeForLine = (line) => {
        if (line.includes('/coursekeeper on') || line.includes('/coursekeeper active')) return 'active';
        if (line.includes('/coursekeeper shadow')) return 'shadow';
        if (line.includes('/coursekeeper off')) return 'off';
        return null;
      };
      const run = (line) => {
        const mode = modeForLine(line);
        if (mode && ckApi && sessionId) {
          ckApi.setMode(sessionId, mode).then((r) => { setModeLabel((r && r.mode) || mode); }).catch(() => setModeLabel(mode));
          setOpen(false);
          return;
        }
        if (mode) setModeLabel(mode);
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
        react.createElement('button', { style: styles.button, title: 'Coursekeeper 控制', onClick: () => setOpen(!open) }, modeLabel || 'CK'),
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

    function SettingsPanel() {
      return react.createElement('div', { style: { padding: 12, fontSize: 13, lineHeight: 1.8, color: '#d8dbe8' } },
        react.createElement('div', { style: { fontWeight: 600, marginBottom: 8 } }, 'Coursekeeper 控制'),
        react.createElement('div', null, '默认 requireUserOptIn=true，新会话默认不触发。'),
        react.createElement('div', null, '会话标题栏的 CK 按钮可切换 off / shadow / active，并执行 verifier allow / cleanup。'),
        react.createElement('div', null, '命令：/coursekeeper status|on|shadow|off|verifier allow|cleanup|help'),
      );
    }

    exports.inject = ['slots', 'remote'];
    exports.apply = async function apply(ctx) {
      const passthrough = { parse: (v) => v };
      const TYPERT_REMOTE = {
        package: 'coursekeeper',
        descriptors: [
          { id: 'coursekeeper#coursekeeper/status', service: 'coursekeeper', namespace: 'coursekeeper', method: 'status', invocation: { kind: 'direct' }, parameters: [{ name: 'sessionId', wire: 'sessionId', source: 'json', codec: { mode: 'strict', typeSymbol: 'coursekeeper#coursekeeper/status:sessionId', schema: passthrough } }], result: { mode: 'strict', typeSymbol: 'coursekeeper#coursekeeper/status:result', schema: passthrough }, sourceLocation: { file: 'coursekeeper-service.ts', line: 1, column: 1 } },
          { id: 'coursekeeper#coursekeeper/setMode', service: 'coursekeeper', namespace: 'coursekeeper', method: 'setMode', invocation: { kind: 'direct' }, parameters: [{ name: 'sessionId', wire: 'sessionId', source: 'json', codec: { mode: 'strict', typeSymbol: 'coursekeeper#coursekeeper/setMode:sessionId', schema: passthrough } }, { name: 'mode', wire: 'mode', source: 'json', codec: { mode: 'strict', typeSymbol: 'coursekeeper#coursekeeper/setMode:mode', schema: passthrough } }], result: { mode: 'strict', typeSymbol: 'coursekeeper#coursekeeper/setMode:result', schema: passthrough }, sourceLocation: { file: 'coursekeeper-service.ts', line: 1, column: 1 } },
        ],
      };
      try { await ctx.remote[String.fromCharCode(36) + 'mount'](TYPERT_REMOTE); } catch (e) { /* remote unavailable; command fallback remains */ }
      let ckApi = null;
      try { ckApi = ctx.get('remote.coursekeeper'); } catch (e) { ckApi = null; }
      ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions',
        id: 'coursekeeper',
        order: 100,
        label: 'Coursekeeper',
        inject: () => ({ ckApi }),
      }, CoursekeeperAction));
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'coursekeeper',
        order: 100,
        label: () => 'Coursekeeper',
      }, SettingsPanel));
    };
    return module.exports;
  },
});
