const STORAGE_KEYS = {
  returns: "returnosai_returns",
  decisions: "returnosai_decisions",
  policy: "returnosai_policy"
};

const REQUIRED_COLUMNS = [
  "orderId", "sku", "category", "sellingPrice", "returnReason", "conditionGrade",
  "returnShippingCost", "repackagingCost", "resaleValue", "discountSaleValue",
  "vendorReturnEligible", "vendorReturnRecoveryValue", "disposalCost",
  "currentStock", "seasonDaysLeft", "quantity", "notes"
];

const COLUMN_LABELS_KO = {
  orderId: "주문번호",
  sku: "상품코드",
  category: "카테고리",
  sellingPrice: "판매가",
  returnReason: "반품 사유",
  conditionGrade: "상품 상태",
  returnShippingCost: "회수 배송비",
  repackagingCost: "재포장 비용",
  resaleValue: "재판매 가치",
  discountSaleValue: "할인전환 가치",
  vendorReturnEligible: "공급사 반송 가능 여부",
  vendorReturnRecoveryValue: "공급사 반송 회수 가치",
  disposalCost: "폐기 비용",
  currentStock: "현재 재고 수준",
  seasonDaysLeft: "시즌 종료까지 남은 일수",
  quantity: "수량",
  notes: "메모"
};

const OPTION_LABELS = {
  resale: "재판매",
  repackagedResale: "재포장 후 재판매",
  discount: "할인전환",
  vendorReturn: "공급사 반송",
  dispose: "폐기"
};

const DEFAULT_POLICY = {
  shippingOffset: 0,
  repackagingOffset: 0,
  retentionCost: 0,
  disposalValueThreshold: 12000,
  lowStockThreshold: 6,
  seasonUrgentThreshold: 21
};

const state = {
  returns: [],
  decisions: {},
  policy: { ...DEFAULT_POLICY },
  selectedId: null
};

const formatKRW = (num) => `₩${Math.round(num).toLocaleString("ko-KR")}`;

function loadState() {
  const storedReturns = localStorage.getItem(STORAGE_KEYS.returns);
  state.returns = storedReturns ? JSON.parse(storedReturns) : window.SEED_RETURNS;
  const storedDecisions = localStorage.getItem(STORAGE_KEYS.decisions);
  state.decisions = storedDecisions ? JSON.parse(storedDecisions) : {};
  const storedPolicy = localStorage.getItem(STORAGE_KEYS.policy);
  state.policy = storedPolicy ? { ...DEFAULT_POLICY, ...JSON.parse(storedPolicy) } : { ...DEFAULT_POLICY };
}

function saveState() {
  localStorage.setItem(STORAGE_KEYS.returns, JSON.stringify(state.returns));
  localStorage.setItem(STORAGE_KEYS.decisions, JSON.stringify(state.decisions));
  localStorage.setItem(STORAGE_KEYS.policy, JSON.stringify(state.policy));
}

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function applyPolicyValues(item) {
  return {
    ...item,
    returnShippingCost: parseNumber(item.returnShippingCost) + parseNumber(state.policy.shippingOffset),
    repackagingCost: parseNumber(item.repackagingCost) + parseNumber(state.policy.repackagingOffset)
  };
}

function calculateOptions(item) {
  const row = applyPolicyValues(item);
  const quantity = parseNumber(row.quantity) || 1;
  const retention = parseNumber(state.policy.retentionCost);

  const options = {
    resale: {
      available: true,
      expectedValue: (parseNumber(row.resaleValue) - parseNumber(row.returnShippingCost) - retention) * quantity
    },
    repackagedResale: {
      available: true,
      expectedValue: (parseNumber(row.resaleValue) - parseNumber(row.returnShippingCost) - parseNumber(row.repackagingCost) - retention) * quantity
    },
    discount: {
      available: true,
      expectedValue: (parseNumber(row.discountSaleValue) - parseNumber(row.returnShippingCost) - retention) * quantity
    },
    vendorReturn: {
      available: Boolean(row.vendorReturnEligible),
      expectedValue: Boolean(row.vendorReturnEligible)
        ? (parseNumber(row.vendorReturnRecoveryValue) - parseNumber(row.returnShippingCost)) * quantity
        : null
    },
    dispose: {
      available: true,
      expectedValue: (-parseNumber(row.disposalCost) - parseNumber(row.returnShippingCost)) * quantity
    }
  };

  const adjustedScores = Object.fromEntries(
    Object.entries(options).map(([k, v]) => [k, v.available ? v.expectedValue : -Infinity])
  );
  const reasons = [];

  if (row.currentStock <= state.policy.lowStockThreshold && row.conditionGrade === "A") {
    adjustedScores.resale += 3500;
    reasons.push("현재 재고가 낮아 재판매 우선순위가 높습니다.");
  }
  if (row.seasonDaysLeft <= state.policy.seasonUrgentThreshold) {
    adjustedScores.discount += 2800;
    reasons.push("시즌 종료가 임박해 할인전환이 유리합니다.");
  }
  if (row.conditionGrade === "C") {
    adjustedScores.resale -= 4500;
    adjustedScores.repackagedResale -= 2500;
    reasons.push("상품 상태가 좋지 않아 일반 재판매 점수를 낮췄습니다.");
  }
  if (row.conditionGrade === "A") {
    adjustedScores.resale += 1000;
    reasons.push("상품 상태가 양호합니다.");
  }
  if (row.vendorReturnEligible) {
    adjustedScores.vendorReturn += 1200;
    reasons.push("공급사 반송이 가능하며 손실이 가장 적은지 함께 비교했습니다.");
  }
  if (row.resaleValue <= state.policy.disposalValueThreshold && row.returnShippingCost >= 3000) {
    adjustedScores.dispose += 3000;
    reasons.push("저가 상품이라 회수비 부담이 커 폐기 대안도 검토했습니다.");
  }
  if (row.resaleValue - row.returnShippingCost > 15000) {
    reasons.push("회수비 대비 재판매 가치가 높습니다.");
  }

  const valid = Object.entries(adjustedScores).filter(([, v]) => Number.isFinite(v));
  valid.sort((a, b) => b[1] - a[1]);
  const [bestKey] = valid[0] || ["dispose"];

  if (reasons.length === 0) reasons.push("손익 기준으로 가장 유리한 처리안을 선택했습니다.");

  return {
    options,
    recommendation: bestKey,
    reasons: Array.from(new Set(reasons))
  };
}

function calcPriority(item, recKey, expectedValue) {
  let score = 0;
  if (item.conditionGrade === "C") score += 2;
  if (item.seasonDaysLeft <= state.policy.seasonUrgentThreshold) score += 2;
  if (item.currentStock <= state.policy.lowStockThreshold) score += 2;
  if (expectedValue < 0) score += 2;
  if (recKey === "dispose") score += 1;
  return score >= 6 ? "높음" : score >= 3 ? "보통" : "낮음";
}

function buildComputedRows() {
  return state.returns.map((item) => {
    const evaluated = calculateOptions(item);
    const recommendedExpected = evaluated.options[evaluated.recommendation].expectedValue;
    return {
      ...item,
      evaluation: evaluated,
      expectedValue: recommendedExpected,
      priority: calcPriority(item, evaluated.recommendation, recommendedExpected),
      finalDecision: state.decisions[item.id] || null
    };
  });
}

function switchTab(tabId) {
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === tabId));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tabId));
}

function renderBarList(targetId, mapObj) {
  const el = document.getElementById(targetId);
  const entries = Object.entries(mapObj);
  if (!entries.length) {
    el.className = "bar-list empty-state";
    el.textContent = "데이터가 없습니다.";
    return;
  }
  el.className = "bar-list";
  const max = Math.max(...entries.map(([, v]) => v));
  el.innerHTML = entries
    .map(([label, value]) => `
      <div class="bar-row">
        <span>${label}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max((value / max) * 100, 5)}%"></div></div>
        <strong>${value.toLocaleString("ko-KR")}</strong>
      </div>
    `)
    .join("");
}

function renderDashboard(rows) {
  document.getElementById("totalCases").textContent = rows.length.toLocaleString("ko-KR");
  const totalExpected = rows.reduce((s, r) => s + r.expectedValue, 0);
  document.getElementById("totalExpected").textContent = formatKRW(totalExpected);

  const savedRows = rows.filter((r) => r.finalDecision);
  document.getElementById("savedCount").textContent = savedRows.length.toLocaleString("ko-KR");
  const savings = savedRows.reduce((sum, row) => {
    const best = row.expectedValue;
    const selected = row.evaluation.options[row.finalDecision]?.expectedValue;
    return sum + (best - (selected ?? best));
  }, 0);
  document.getElementById("savedLoss").textContent = formatKRW(savings);

  const dist = {};
  const reasons = {};
  const skuMap = {};

  rows.forEach((r) => {
    const recLabel = OPTION_LABELS[r.evaluation.recommendation];
    dist[recLabel] = (dist[recLabel] || 0) + 1;
    reasons[r.returnReason] = (reasons[r.returnReason] || 0) + 1;
    if (!skuMap[r.sku]) skuMap[r.sku] = { count: 0, total: 0 };
    skuMap[r.sku].count += 1;
    skuMap[r.sku].total += r.expectedValue;
  });

  renderBarList("recommendationDist", dist);
  const top5Reasons = Object.fromEntries(Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 5));
  renderBarList("reasonTop", top5Reasons);

  const skuBody = document.getElementById("skuSummaryBody");
  const worstSku = Object.entries(skuMap)
    .map(([sku, v]) => ({ sku, ...v, avg: v.total / v.count }))
    .sort((a, b) => a.total - b.total)
    .slice(0, 5);

  if (!worstSku.length) {
    skuBody.innerHTML = '<tr><td colspan="4" class="empty-state">데이터가 없습니다.</td></tr>';
  } else {
    skuBody.innerHTML = worstSku
      .map((s) => `<tr><td>${s.sku}</td><td>${s.count}</td><td>${formatKRW(s.avg)}</td><td>${formatKRW(s.total)}</td></tr>`)
      .join("");
  }

  renderSimulatorDistribution(rows);
}

function renderList(rows) {
  const search = document.getElementById("searchInput").value.trim().toLowerCase();
  const category = document.getElementById("categoryFilter").value;
  const condition = document.getElementById("conditionFilter").value;
  const sortKey = document.getElementById("sortSelect").value;

  let filtered = rows.filter((r) => {
    const matchedSearch = !search || [r.orderId, r.sku, r.returnReason].join(" ").toLowerCase().includes(search);
    return matchedSearch && (!category || r.category === category) && (!condition || r.conditionGrade === condition);
  });

  const sorter = {
    priority_desc: (a, b) => ({ 높음: 3, 보통: 2, 낮음: 1 }[b.priority] - ({ 높음: 3, 보통: 2, 낮음: 1 }[a.priority])),
    expected_desc: (a, b) => b.expectedValue - a.expectedValue,
    expected_asc: (a, b) => a.expectedValue - b.expectedValue,
    season_asc: (a, b) => a.seasonDaysLeft - b.seasonDaysLeft
  };
  filtered.sort(sorter[sortKey]);

  const body = document.getElementById("returnTableBody");
  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="8" class="empty-state">조건에 맞는 반품 건이 없습니다.</td></tr>';
    return;
  }

  body.innerHTML = filtered
    .map((r) => {
      const pClass = r.priority === "높음" ? "high" : r.priority === "보통" ? "mid" : "low";
      return `
        <tr class="clickable" data-id="${r.id}">
          <td>${r.orderId}</td>
          <td>${r.sku}</td>
          <td>${r.category}</td>
          <td>${r.returnReason}</td>
          <td>${r.conditionGrade}</td>
          <td>${OPTION_LABELS[r.evaluation.recommendation]}</td>
          <td>${formatKRW(r.expectedValue)}</td>
          <td><span class="badge ${pClass}">${r.priority}</span></td>
        </tr>
      `;
    })
    .join("");

  body.querySelectorAll("tr.clickable").forEach((tr) => {
    tr.addEventListener("click", () => {
      state.selectedId = tr.dataset.id;
      renderDetail(rows.find((x) => x.id === state.selectedId));
      switchTab("detail");
    });
  });
}

function renderDetail(row) {
  if (!row) return;
  const info = {
    주문번호: row.orderId,
    상품코드: row.sku,
    카테고리: row.category,
    판매가: formatKRW(row.sellingPrice),
    반품사유: row.returnReason,
    "상품 상태": row.conditionGrade,
    "시즌 종료까지 남은 일수": `${row.seasonDaysLeft}일`,
    "현재 재고 수준": `${row.currentStock}`,
    "회수 배송비": formatKRW(applyPolicyValues(row).returnShippingCost),
    "재포장 비용": formatKRW(applyPolicyValues(row).repackagingCost),
    "재판매 가치": formatKRW(row.resaleValue),
    "할인전환 가치": formatKRW(row.discountSaleValue),
    "공급사 반송 가능": row.vendorReturnEligible ? "가능" : "불가",
    "공급사 반송 회수 가치": formatKRW(row.vendorReturnRecoveryValue),
    "폐기 비용": formatKRW(row.disposalCost),
    수량: row.quantity,
    메모: row.notes || "-"
  };

  document.getElementById("detailInfo").innerHTML = Object.entries(info)
    .map(([k, v]) => `<dl class="detail-item"><dt>${k}</dt><dd>${v}</dd></dl>`)
    .join("");

  const optionBody = document.getElementById("optionBody");
  optionBody.innerHTML = Object.entries(row.evaluation.options)
    .map(([key, value]) => `
      <tr>
        <td>${OPTION_LABELS[key]}</td>
        <td>${value.available ? formatKRW(value.expectedValue) : "계산 불가"}</td>
        <td>${value.available ? "가능" : "불가"}</td>
      </tr>
    `).join("");

  document.getElementById("recommendedAction").textContent = OPTION_LABELS[row.evaluation.recommendation];
  document.getElementById("recommendationReasons").innerHTML = row.evaluation.reasons.map((x) => `<li>${x}</li>`).join("");

  const select = document.getElementById("finalDecisionSelect");
  select.innerHTML = Object.entries(row.evaluation.options)
    .filter(([, v]) => v.available)
    .map(([k]) => `<option value="${k}">${OPTION_LABELS[k]}</option>`)
    .join("");
  select.value = row.finalDecision || row.evaluation.recommendation;
}

function renderCategoryFilter() {
  const select = document.getElementById("categoryFilter");
  const current = select.value;
  const categories = [...new Set(state.returns.map((r) => r.category))];
  select.innerHTML = '<option value="">카테고리 전체</option>' + categories.map((c) => `<option value="${c}">${c}</option>`).join("");
  select.value = categories.includes(current) ? current : "";
}

function renderSimulatorDistribution(rows) {
  const dist = {};
  rows.forEach((r) => {
    const key = OPTION_LABELS[r.evaluation.recommendation];
    dist[key] = (dist[key] || 0) + 1;
  });
  renderBarList("simDist", dist);
}

function syncPolicyForm() {
  const form = document.getElementById("policyForm");
  Object.entries(state.policy).forEach(([k, v]) => {
    if (form.elements[k]) form.elements[k].value = v;
  });
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length);
  if (lines.length < 2) throw new Error("CSV 데이터가 비어 있거나 행 수가 부족합니다.");
  const header = parseCsvLine(lines[0]);
  const missing = REQUIRED_COLUMNS.filter((col) => !header.includes(col));
  if (missing.length) throw new Error(`필수 컬럼이 누락되었습니다: ${missing.map((c) => COLUMN_LABELS_KO[c] || c).join(", ")}`);

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const obj = {};
    header.forEach((key, idx) => { obj[key] = cells[idx] ?? ""; });

    if (!obj.orderId || !obj.sku || !obj.category || !obj.returnReason) {
      throw new Error(`${i + 1}행: 주문번호, 상품코드, 카테고리, 반품 사유는 필수입니다.`);
    }
    if (!["A", "B", "C"].includes(obj.conditionGrade)) {
      throw new Error(`${i + 1}행: 상품 상태는 A/B/C 중 하나여야 합니다.`);
    }

    records.push(normalizeRecord(obj));
  }
  return records;
}

function normalizeRecord(obj) {
  return {
    id: obj.id || `r${Date.now()}${Math.floor(Math.random() * 10000)}`,
    orderId: String(obj.orderId || "").trim(),
    sku: String(obj.sku || "").trim(),
    category: String(obj.category || "").trim(),
    sellingPrice: parseNumber(obj.sellingPrice),
    returnReason: String(obj.returnReason || "").trim(),
    conditionGrade: String(obj.conditionGrade || "A").trim(),
    returnShippingCost: parseNumber(obj.returnShippingCost),
    repackagingCost: parseNumber(obj.repackagingCost),
    resaleValue: parseNumber(obj.resaleValue),
    discountSaleValue: parseNumber(obj.discountSaleValue),
    vendorReturnEligible: String(obj.vendorReturnEligible).toLowerCase() === "true",
    vendorReturnRecoveryValue: parseNumber(obj.vendorReturnRecoveryValue),
    disposalCost: parseNumber(obj.disposalCost),
    currentStock: parseNumber(obj.currentStock),
    seasonDaysLeft: parseNumber(obj.seasonDaysLeft),
    quantity: parseNumber(obj.quantity) || 1,
    notes: String(obj.notes || "")
  };
}

function renderAll() {
  const rows = buildComputedRows();
  renderCategoryFilter();
  renderDashboard(rows);
  renderList(rows);
  if (state.selectedId) {
    const selected = rows.find((r) => r.id === state.selectedId);
    if (selected) renderDetail(selected);
  }
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  ["searchInput", "categoryFilter", "conditionFilter", "sortSelect"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderAll);
    document.getElementById(id).addEventListener("change", renderAll);
  });


  document.getElementById("startLoadSampleBtn")?.addEventListener("click", () => {
    state.returns = JSON.parse(JSON.stringify(window.SEED_RETURNS));
    state.decisions = {};
    saveState();
    document.getElementById("startMsg").textContent = "샘플 데이터를 불러왔습니다. 반품 목록에서 바로 확인하세요.";
    renderAll();
    switchTab("list");
  });

  document.getElementById("startManualBtn")?.addEventListener("click", () => {
    switchTab("entry");
    document.querySelector('#manualForm input[name="orderId"]')?.focus();
  });

  document.getElementById("startCsvBtn")?.addEventListener("click", () => {
    switchTab("entry");
    document.getElementById("csvInput")?.focus();
  });

  document.getElementById("showExampleBtn")?.addEventListener("click", () => {
    alert(`입력 예시
주문번호: ORD-2026-00125
SKU: FSH-JK-301
판매가: 59000
회수 배송비: 3500
현재 재고: 12
시즌 종료까지 남은 일수: 18`);
  });

  document.getElementById("manualForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const obj = Object.fromEntries(formData.entries());
    const record = normalizeRecord(obj);

    if (!["A", "B", "C"].includes(record.conditionGrade)) {
      document.getElementById("manualFormMsg").textContent = "상품 상태는 A/B/C 중 하나여야 합니다.";
      return;
    }

    state.returns.unshift(record);
    saveState();
    e.target.reset();
    document.getElementById("manualFormMsg").textContent = "반품 건이 정상적으로 추가되었습니다.";
    renderAll();
  });

  document.getElementById("importCsvBtn").addEventListener("click", async () => {
    const input = document.getElementById("csvInput");
    const file = input.files?.[0];
    const msg = document.getElementById("csvMsg");
    if (!file) {
      msg.textContent = "업로드할 CSV 파일을 먼저 선택해 주세요.";
      return;
    }
    try {
      const text = await file.text();
      const records = parseCsv(text);
      state.returns = [...records, ...state.returns];
      saveState();
      msg.textContent = `${records.length}건을 성공적으로 가져왔습니다.`;
      input.value = "";
      renderAll();
    } catch (err) {
      msg.textContent = `업로드 오류: ${err.message}`;
    }
  });

  document.getElementById("policyForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.policy = {
      shippingOffset: parseNumber(fd.get("shippingOffset")),
      repackagingOffset: parseNumber(fd.get("repackagingOffset")),
      retentionCost: parseNumber(fd.get("retentionCost")),
      disposalValueThreshold: parseNumber(fd.get("disposalValueThreshold")),
      lowStockThreshold: parseNumber(fd.get("lowStockThreshold")),
      seasonUrgentThreshold: parseNumber(fd.get("seasonUrgentThreshold"))
    };
    saveState();
    document.getElementById("policyMsg").textContent = "정책을 저장했고 추천 결과에 바로 반영했습니다.";
    renderAll();
  });

  document.getElementById("backToListBtn").addEventListener("click", () => switchTab("list"));

  document.getElementById("saveDecisionBtn").addEventListener("click", () => {
    if (!state.selectedId) return;
    const selected = document.getElementById("finalDecisionSelect").value;
    state.decisions[state.selectedId] = selected;
    saveState();
    document.getElementById("decisionMsg").textContent = "최종 처리 결정을 저장했습니다.";
    renderAll();
  });

  document.getElementById("resetDemoBtn").addEventListener("click", () => {
    if (!confirm("현재 데이터와 저장된 결정·정책을 모두 지우고 샘플 데이터로 다시 시작할까요?")) return;
    state.returns = JSON.parse(JSON.stringify(window.SEED_RETURNS));
    state.decisions = {};
    state.policy = { ...DEFAULT_POLICY };
    state.selectedId = null;
    saveState();
    syncPolicyForm();
    renderAll();
    switchTab("dashboard");
  });
}

function init() {
  loadState();
  bindEvents();
  syncPolicyForm();
  renderAll();
}

document.addEventListener("DOMContentLoaded", init);
