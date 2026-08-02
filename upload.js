const UploadView = (() => {
  function render() {
    return `
      <div class="card">
        <h3>Upload Transactions</h3>
        <div class="empty-state">
          Coming in Stage 2 — CSV, Excel, and PDF bulk upload with automatic category detection.
        </div>
      </div>
    `;
  }
  function afterRender() {}
  return { render, afterRender };
})();
