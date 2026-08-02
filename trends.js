const TrendsView = (() => {
  function render() {
    return `
      <div class="card">
        <h3>Spend Trends & Alerts</h3>
        <div class="empty-state">
          Coming in Stage 3 — this will break down spend by category, highlight growing or unusual trends, and let you set alert thresholds per category.
        </div>
      </div>
    `;
  }
  function afterRender() {}
  return { render, afterRender };
})();
