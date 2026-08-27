(() => {
  "use strict";

  const DATA_URLS = ["data/jeju_para_games_2026.json", "/api/para-games"];
  const FACILITY_API_URL = "/api/help-chat";
  const FACILITY_DATA_URL = "data/jeju_para_games_nearby_facilities.json";
  const RESOURCE_TYPES = ["accessible_toilet", "power_wheelchair_fast_charger"];
  const venueList = document.getElementById("gamesVenueList");
  const venueDetail = document.getElementById("gamesVenueDetail");
  const venueSearch = document.getElementById("gamesVenueSearch");
  const eventStatus = document.getElementById("gamesEventStatus");
  const mySportForm = document.getElementById("gamesMySportForm");
  const mySportSearch = document.getElementById("gamesMySportSearch");
  const recentSports = document.getElementById("gamesRecentSports");
  const recentSportList = document.getElementById("gamesRecentSportList");
  const bottomFindButton = document.getElementById("gamesBottomFind");
  const updatedAt = document.getElementById("gamesUpdatedAt");
  const liveAlert = document.getElementById("gamesLiveAlert");
  const liveAlertTitle = document.getElementById("gamesLiveAlertTitle");
  const liveAlertDetail = document.getElementById("gamesLiveAlertDetail");
  const noticeTitle = document.getElementById("gamesNoticeTitle");
  const noticeDetail = document.getElementById("gamesNoticeDetail");
  const noticeActions = document.getElementById("gamesNoticeActions");
  const overviewContent = document.getElementById("gamesOverviewContent");
  const scheduleSearch = document.getElementById("gamesScheduleSearch");
  const scheduleDate = document.getElementById("gamesScheduleDate");
  const scheduleScope = document.getElementById("gamesScheduleScope");
  const scheduleCount = document.getElementById("gamesScheduleCount");
  const scheduleResults = document.getElementById("gamesScheduleResults");
  const contactGrid = document.getElementById("gamesContactGrid");

  const RECENT_SPORTS_KEY = "gachibom.paraGames.recentSports";
  const RECENT_SPORTS_LIMIT = 5;

  let pageData = null;
  let selectedVenueId = "";
  let selectedScheduleSportIndex = 0;
  let facilityRequest = null;
  let facilityCache = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value));
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (error) {
      return "";
    }
  }

  function currentLocalDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function daysUntil(fromDate, toDate) {
    const from = Date.parse(`${fromDate}T00:00:00Z`);
    const to = Date.parse(`${toDate}T00:00:00Z`);
    return Math.max(0, Math.round((to - from) / 86400000));
  }

  function formatReferenceDate(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return year && month && day ? `${year}. ${month}. ${day}.` : "확인 필요";
  }

  function mapUrl(item) {
    const latitude = Number(item?.latitude);
    const longitude = Number(item?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return "";
    }
    return `https://map.kakao.com/link/map/${encodeURIComponent(item.name || "경기장")},${latitude},${longitude}`;
  }

  function venueSearchUrl(event) {
    const query = `${event.location_scope === "jeju" ? "제주 " : ""}${event.venue}`;
    return `https://map.kakao.com/link/search/${encodeURIComponent(query)}`;
  }

  // 데이터에 경기별 시작 시각이 없으므로, 시각 대신 확인처(종목단체 공지)를 그 자리에서 알려 준다.
  function scheduleNoticeUrl(event) {
    const venue = event.detail_venue_id
      ? pageData.venues.find((item) => item.id === event.detail_venue_id)
      : null;
    return safeHttpUrl(venue?.source_url)
      || safeHttpUrl(pageData.event?.source_url)
      || safeHttpUrl(pageData.notices?.[0]?.source_url);
  }

  function safeContactUrl(action) {
    const kind = String(action?.kind || "");
    const number = String(action?.value || "").replace(/\D/g, "");
    return ["tel", "sms"].includes(kind) && /^\d{3,11}$/.test(number) ? `${kind}:${number}` : "";
  }

  function flattenSchedule(data = pageData) {
    return data.sports.flatMap((sport, sportIndex) => sport.events.map((event) => ({
      ...event,
      sport_name: sport.name,
      sport_index: sportIndex
    })));
  }

  function validateData(data) {
    if (
      !data?.event
      || !Array.isArray(data.venues)
      || !data.venues.length
      || !Array.isArray(data.sports)
      || !Array.isArray(data.ceremonies)
      || !Array.isArray(data.contacts)
      || !Array.isArray(data.event.disability_types)
    ) {
      throw new Error("대회 데이터 형식이 올바르지 않습니다.");
    }
    const validVenues = data.venues.every((venue) => (
      venue?.id
      && venue?.name
      && Number(venue.latitude) >= 33
      && Number(venue.latitude) <= 34
      && Number(venue.longitude) >= 126
      && Number(venue.longitude) <= 127
      && safeHttpUrl(venue.source_url)
    ));
    if (!validVenues) {
      throw new Error("경기장 데이터에 확인이 필요한 항목이 있습니다.");
    }
    const validSports = data.sports.length === data.event.sports_count && data.sports.every((sport) => (
      sport?.name
      && Array.isArray(sport.events)
      && sport.events.length
      && sport.events.every((event) => (
        event?.venue
        && event?.schedule_label
        && /^\d{4}-\d{2}-\d{2}$/.test(event.start_date)
        && /^\d{4}-\d{2}-\d{2}$/.test(event.end_date)
        && event.start_date <= event.end_date
        && ["jeju", "off_island"].includes(event.location_scope)
      ))
    ));
    if (!validSports) {
      throw new Error("전체 경기 일정 데이터에 확인이 필요한 항목이 있습니다.");
    }
    const validContacts = data.contacts.every((contact) => (
      contact?.title
      && Array.isArray(contact.actions)
      && contact.actions.some((action) => safeContactUrl(action))
      && safeHttpUrl(contact.source_url)
    ));
    if (!validContacts) {
      throw new Error("현장 연락처 데이터에 확인이 필요한 항목이 있습니다.");
    }
    return data;
  }

  function renderEventStatus() {
    const today = currentLocalDate();
    const { event } = pageData;
    const hasPreEvent = flattenSchedule().some((item) => item.start_date <= today && item.end_date >= today);
    if (today < event.start_date) {
      eventStatus.textContent = hasPreEvent ? "사전경기 진행 중" : `본대회 D-${daysUntil(today, event.start_date)}`;
    } else if (today <= event.end_date) {
      eventStatus.textContent = "대회 진행 중";
    } else {
      eventStatus.textContent = "대회 종료";
    }
  }

  // 최근 본 종목은 편의 기능이므로 저장소 접근이 막혀도 페이지가 멈추지 않게 방어한다.
  function readRecentSports() {
    try {
      const stored = JSON.parse(window.localStorage.getItem(RECENT_SPORTS_KEY) || "[]");
      return Array.isArray(stored) ? stored.filter((name) => typeof name === "string" && name.trim()).slice(0, RECENT_SPORTS_LIMIT) : [];
    } catch (error) {
      return [];
    }
  }

  function writeRecentSports(names) {
    try {
      window.localStorage.setItem(RECENT_SPORTS_KEY, JSON.stringify(names));
    } catch (error) {
      // 시크릿 모드나 저장 용량 초과 시에는 이번 방문에만 적용된다.
    }
  }

  function rememberSport(name) {
    const sportName = String(name || "").trim();
    if (!sportName) {
      return;
    }
    const next = [sportName, ...readRecentSports().filter((item) => item !== sportName)].slice(0, RECENT_SPORTS_LIMIT);
    writeRecentSports(next);
    renderRecentSports();
  }

  function renderRecentSports() {
    if (!recentSports || !recentSportList) {
      return;
    }
    const names = readRecentSports();
    recentSports.hidden = !names.length;
    recentSportList.innerHTML = names.map((name) => `
      <button class="games-recent-sport" type="button" data-recent-sport="${escapeHtml(name)}">
        <i class="bi bi-clock-history" aria-hidden="true"></i>
        <span>${escapeHtml(name)}</span>
        <span class="games-sr-only">종목 일정 보기</span>
      </button>
    `).join("");
  }

  // 히어로 검색은 전체 종목 일정 검색창과 값을 공유해 결과가 한 곳에서만 갱신되게 한다.
  function applyMySportQuery(query, { scroll = false, remember = false } = {}) {
    const keyword = String(query || "").trim();
    scheduleSearch.value = keyword;
    if (!pageData) {
      return;
    }
    const matchedSportIndex = pageData.sports.findIndex((sport) => normalizedText(sport.name).includes(normalizedText(keyword)));
    if (keyword && matchedSportIndex >= 0) {
      selectedScheduleSportIndex = matchedSportIndex;
    }
    renderSchedule();
    if (remember && keyword && matchedSportIndex >= 0) {
      rememberSport(pageData.sports[matchedSportIndex].name);
    }
    if (scroll) {
      focusScheduleSearch({ focusInput: false });
    }
  }

  // 하단 고정바·히어로에서 공통으로 쓰는 이동 동작
  function focusScheduleSearch({ focusInput = true } = {}) {
    document.getElementById("gamesSchedule")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (focusInput) {
      scheduleSearch.focus({ preventScroll: true });
    }
  }

  function renderOverview() {
    const { event, ceremonies } = pageData;
    const sourceUrl = safeHttpUrl(event.source_url);
    overviewContent.innerHTML = `
      <div class="games-overview-layout">
        <div class="games-overview-facts">
          <dl>
            <div><dt>대회 기간</dt><dd>${escapeHtml(formatReferenceDate(event.start_date))}~${escapeHtml(formatReferenceDate(event.end_date).replace(/^\d{4}\. /, ""))}</dd></div>
            <div><dt>예상 참가</dt><dd>${escapeHtml(event.participants_label)}<small>${escapeHtml(event.athletes_label)} · ${escapeHtml(event.staff_label)}</small></dd></div>
            <div><dt>주최</dt><dd>${escapeHtml(event.host)}</dd></div>
            <div><dt>주관</dt><dd>${escapeHtml(event.organizers)}</dd></div>
          </dl>
          <div class="games-disability-types">
            <strong>참가 장애 유형 5개</strong>
            <div>${event.disability_types.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}</div>
          </div>
          <blockquote>${escapeHtml(event.slogan)}</blockquote>
        </div>
        <div class="games-ceremonies">
          <h3>개·폐회식</h3>
          ${ceremonies.map((item) => `
            <article class="games-ceremony ${item.status === "verify" ? "is-verify" : ""}">
              <div>
                <span>${escapeHtml(item.name)}</span>
                <time datetime="${escapeHtml(`${item.date}T${item.time}`)}">${escapeHtml(formatReferenceDate(item.date))} ${escapeHtml(item.time)}</time>
              </div>
              <strong>${escapeHtml(item.venue)}</strong>
              ${item.note ? `<p><i class="bi bi-exclamation-triangle" aria-hidden="true"></i> ${escapeHtml(item.note)}</p>` : ""}
              ${item.venue_id ? `<a href="para-games.html?venue=${encodeURIComponent(item.venue_id)}#gamesFieldGuide">경기장 상세 보기 <i class="bi bi-arrow-right" aria-hidden="true"></i></a>` : ""}
            </article>
          `).join("")}
        </div>
      </div>
      <div class="games-guide-status">
        <i class="bi bi-shield-check" aria-hidden="true"></i>
        <p><strong>공식 자료 기준</strong>${escapeHtml(event.guide_status)}</p>
        ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">참가요강 원문 <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a>` : ""}
      </div>
    `;
  }

  function normalizedText(value) {
    return String(value ?? "").normalize("NFKC").toLocaleLowerCase("ko");
  }

  function scheduleScopeLabel(sport) {
    const hasOffIsland = sport.events.some((event) => event.location_scope === "off_island");
    return hasOffIsland ? (sport.events.every((event) => event.location_scope === "off_island") ? "타 시도" : "제주·타 시도") : "제주";
  }

  function renderSchedule() {
    const query = normalizedText(scheduleSearch.value.trim());
    const selectedDate = scheduleDate.value;
    const selectedScope = scheduleScope.value;
    const filteredSports = pageData.sports.map((sport, sportIndex) => {
      const sportMatches = !query || normalizedText(sport.name).includes(query);
      const events = sport.events.filter((event) => {
        const queryMatches = sportMatches || [event.division, event.disability, event.venue, event.schedule_label, event.preparation, event.scope_label]
          .some((value) => normalizedText(value).includes(query));
        const dateMatches = selectedDate === "all"
          || (selectedDate === "pre_event" && event.start_date < pageData.event.start_date)
          || (event.start_date <= selectedDate && event.end_date >= selectedDate);
        const scopeMatches = selectedScope === "all" || event.location_scope === selectedScope;
        return queryMatches && dateMatches && scopeMatches;
      });
      return { ...sport, sportIndex, events };
    }).filter((sport) => sport.events.length);

    const rowCount = filteredSports.reduce((total, sport) => total + sport.events.length, 0);
    scheduleCount.textContent = `${filteredSports.length}개 종목 · ${rowCount}개 경기장 항목`;
    if (!filteredSports.length) {
      scheduleResults.innerHTML = '<p class="games-empty">조건에 맞는 경기 일정이 없습니다.</p>';
      return;
    }

    const selectedSport = filteredSports.find((sport) => sport.sportIndex === selectedScheduleSportIndex) || filteredSports[0];
    selectedScheduleSportIndex = selectedSport.sportIndex;
    const selectedScopeLabel = scheduleScopeLabel(selectedSport);
    scheduleResults.innerHTML = `
      <label class="games-sport-select" for="gamesSportSelect">
        <span>종목 바로 선택</span>
        <select id="gamesSportSelect" aria-describedby="gamesScheduleCount">
          ${filteredSports.map((sport) => `<option value="${sport.sportIndex}" ${sport.sportIndex === selectedScheduleSportIndex ? "selected" : ""}>${escapeHtml(sport.name)} · ${sport.events.length}개 일정</option>`).join("")}
        </select>
      </label>
      <div class="games-schedule-browser">
        <nav class="games-sport-index" aria-label="종목 선택">
          <div class="games-sport-index-head"><strong>종목 선택</strong><span>${filteredSports.length}개</span></div>
          <div class="games-sport-index-list">
            ${filteredSports.map((sport) => `
              <button class="games-sport-button ${sport.sportIndex === selectedScheduleSportIndex ? "is-active" : ""}" type="button" data-sport-index="${sport.sportIndex}" aria-pressed="${sport.sportIndex === selectedScheduleSportIndex}" aria-controls="gamesSelectedSport">
                <span>${String(sport.sportIndex + 1).padStart(2, "0")}</span>
                <strong>${escapeHtml(sport.name)}</strong>
                <small>${sport.events.length}개 일정 · ${escapeHtml(scheduleScopeLabel(sport))}</small>
              </button>
            `).join("")}
          </div>
        </nav>
        <section class="games-selected-sport" id="gamesSelectedSport" aria-labelledby="gamesSelectedSportTitle">
          <header class="games-selected-sport-head">
            <span>선택한 종목</span>
            <h3 id="gamesSelectedSportTitle">${escapeHtml(selectedSport.name)}</h3>
            <p>${selectedSport.events.length}개 일정 · ${escapeHtml(selectedScopeLabel)}</p>
          </header>
          <div class="games-sport-events" role="list">
            ${selectedSport.events.map((event) => {
              const mapSearchUrl = venueSearchUrl(event);
              const detailUrl = event.detail_venue_id ? `para-games.html?venue=${encodeURIComponent(event.detail_venue_id)}#gamesFieldGuide` : "";
              const noticeUrl = scheduleNoticeUrl(event);
              const timeNote = noticeUrl
                ? `<a href="${escapeHtml(noticeUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(selectedSport.name)} 경기 시각은 종목단체 공지 확인, 새 창">경기 시각은 종목단체 공지 확인 <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a>`
                : "<span>경기 시각은 종목단체 공지 확인</span>";
              return `
                <div class="games-schedule-row ${event.location_scope === "off_island" ? "is-off-island" : ""}" role="listitem">
                  <div class="games-schedule-division"><span>${escapeHtml(event.division)}</span><small>${escapeHtml(event.disability)}</small></div>
                  <div class="games-schedule-date"><strong>${escapeHtml(event.schedule_label)}</strong>${event.preparation ? `<small>${escapeHtml(event.preparation)}</small>` : ""}</div>
                  <div class="games-schedule-venue">
                    <span>${event.location_scope === "off_island" ? `타 시도 · ${escapeHtml(event.scope_label || "")}` : "제주"}</span>
                    <strong>${escapeHtml(event.venue)}</strong>
                  </div>
                  <div class="games-schedule-actions">
                    <a href="${escapeHtml(mapSearchUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(event.venue)} 지도 검색, 새 창"><i class="bi bi-geo-alt" aria-hidden="true"></i> 지도 검색</a>
                    ${detailUrl ? `<a href="${escapeHtml(detailUrl)}"><i class="bi bi-universal-access" aria-hidden="true"></i> 접근 상세</a>` : ""}
                  </div>
                  <p class="games-schedule-time-note"><i class="bi bi-clock" aria-hidden="true"></i> ${timeNote}</p>
                </div>
              `;
            }).join("")}
          </div>
        </section>
      </div>
    `;
  }

  function renderContacts() {
    contactGrid.innerHTML = pageData.contacts.map((contact) => {
      const sourceUrl = safeHttpUrl(contact.source_url);
      return `
        <article class="games-contact-card ${contact.priority === "emergency" ? "is-emergency" : ""}">
          <span>${escapeHtml(contact.category)}</span>
          <h3>${escapeHtml(contact.title)}</h3>
          <strong>${escapeHtml(contact.hours)}</strong>
          <p>${escapeHtml(contact.detail)}</p>
          <div class="games-contact-actions">
            ${contact.actions.map((action) => {
              const url = safeContactUrl(action);
              const icon = action.kind === "sms" ? "bi-chat-text" : "bi-telephone";
              return url ? `<a href="${escapeHtml(url)}"><i class="bi ${icon}" aria-hidden="true"></i> ${escapeHtml(action.label)}</a>` : "";
            }).join("")}
          </div>
          ${sourceUrl ? `<a class="games-contact-source" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">공식 안내 확인 <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a>` : ""}
        </article>
      `;
    }).join("");
  }

  function renderNotices() {
    const notice = pageData.notices?.[0];
    noticeTitle.textContent = notice?.title || "일정은 출발 전에 다시 확인하세요";
    noticeDetail.textContent = notice?.detail || "종목별 경기단체 공지와 현장 운영 안내가 가장 최신일 수 있습니다.";
    liveAlert.hidden = notice?.urgent !== true;
    if (notice?.urgent === true) {
      liveAlertTitle.textContent = notice.title;
      liveAlertDetail.textContent = notice.detail;
    }
    const links = [
      { title: pageData.event.source_title, url: pageData.event.source_url },
      notice && { title: notice.source_title, url: notice.source_url }
    ].filter(Boolean);
    noticeActions.innerHTML = links.map((link) => {
      const url = safeHttpUrl(link.url);
      return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.title)} <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a>` : "";
    }).join("");
  }

  function renderVenueList(query = "") {
    const normalized = query.trim().toLocaleLowerCase("ko");
    const venues = pageData.venues.filter((venue) => (
      !normalized
      || [venue.name, venue.program, venue.area].some((value) => String(value).toLocaleLowerCase("ko").includes(normalized))
    ));

    if (!venues.length) {
      venueList.innerHTML = '<p class="games-empty">조건에 맞는 경기장이 없습니다.</p>';
      return;
    }

    venueList.innerHTML = venues.map((venue) => `
      <button class="games-venue-button" type="button" data-venue-id="${escapeHtml(venue.id)}" aria-current="${venue.id === selectedVenueId}">
        <span>${escapeHtml(venue.program)} · ${escapeHtml(venue.phase)}</span>
        <small class="games-venue-area">${escapeHtml(venue.area)}</small>
        <strong>${escapeHtml(venue.name)}</strong>
        <small>${escapeHtml(venue.schedule_label)}</small>
      </button>
    `).join("");
  }

  function renderVenueDetail(venue) {
    const officialUrl = safeHttpUrl(venue.source_url);
    const venueMapUrl = mapUrl(venue);
    venueDetail.innerHTML = `
      <header class="games-detail-head">
        <div>
          <span class="games-phase-badge">${escapeHtml(venue.phase)}</span>
          <h2>${escapeHtml(venue.name)}</h2>
          <p>${escapeHtml(venue.address)}</p>
        </div>
        <div class="games-detail-actions">
          <a href="${escapeHtml(venueMapUrl)}" target="_blank" rel="noopener noreferrer"><i class="bi bi-map" aria-hidden="true"></i> 카카오맵 열기</a>
          <a href="${escapeHtml(officialUrl)}" target="_blank" rel="noopener noreferrer"><i class="bi bi-check2-circle" aria-hidden="true"></i> 공식 일정 확인</a>
        </div>
      </header>
      <div class="games-detail-body">
        <dl class="games-venue-facts">
          <div><dt>경기·행사</dt><dd>${escapeHtml(venue.program)}</dd></div>
          <div><dt>확인 일정</dt><dd>${escapeHtml(venue.schedule_label)}</dd></div>
          <div><dt>지역</dt><dd>${escapeHtml(venue.area)}</dd></div>
        </dl>

        <section class="games-section" aria-labelledby="gamesAccessTitle">
          <div class="games-section-head">
            <h3 id="gamesAccessTitle">현장 접근 정보</h3>
            <p>확인되지 않은 동선은 임의로 안내하지 않습니다.</p>
          </div>
          <div class="games-access-grid">
            <div class="games-access-card"><i class="bi bi-universal-access-circle" aria-hidden="true"></i><strong>휠체어 출입구</strong><span>현장 확인 필요</span></div>
            <div class="games-access-card"><i class="bi bi-car-front" aria-hidden="true"></i><strong>승하차 구역</strong><span>현장 확인 필요</span></div>
            <div class="games-access-card"><i class="bi bi-bus-front" aria-hidden="true"></i><strong>셔틀·저상버스</strong><span>공식 수송 계획 확인 필요</span></div>
          </div>
          <p class="games-access-note">${escapeHtml(venue.accessibility_note)}</p>
        </section>

        <section class="games-section" aria-labelledby="gamesFacilityTitle">
          <div class="games-section-head">
            <h3 id="gamesFacilityTitle">경기장 주변 접근성 시설</h3>
            <p>경기장 좌표 기준 직선거리 · 실제 이동 경로와 다를 수 있음</p>
          </div>
          <div id="gamesFacilityResults"><p class="games-facility-status">공식 시설 데이터를 확인하고 있습니다.</p></div>
        </section>

        <a class="games-after-link" href="index.html?intro=0#conceptPage">
          <div><span>경기 관람 전후</span><strong>접근성 조건에 맞는 제주 여행 찾기</strong></div>
          <i class="bi bi-arrow-right" aria-hidden="true"></i>
        </a>
      </div>
    `;
  }

  function formatDistance(item) {
    const meters = Number(item?.distance_meters);
    if (!Number.isFinite(meters) || meters < 0) {
      return "거리 확인 필요";
    }
    return meters < 1000 ? `${Math.max(1, Math.round(meters))}m` : `${(meters / 1000).toFixed(1)}km`;
  }

  function renderFacilityResults(payload) {
    const target = document.getElementById("gamesFacilityResults");
    if (!target) {
      return;
    }
    const results = Array.isArray(payload?.nearby_results) ? payload.nearby_results.slice(0, 4) : [];
    if (!results.length) {
      target.innerHTML = '<p class="games-facility-status">표시할 공식 시설 결과가 없습니다. 현장 운영본부에 확인해 주세요.</p>';
      return;
    }

    target.innerHTML = `
      <div class="games-facility-list">
        ${results.map((item) => {
          const facilityMapUrl = mapUrl(item);
          const sourceUrl = safeHttpUrl(item.source_url);
          const label = item.resource_label || (item.resource_type === "power_wheelchair_fast_charger" ? "전동휠체어 급속충전기" : "장애인 화장실");
          return `
            <article class="games-facility-card">
              <div class="games-facility-card-head">
                <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(item.name || "시설명 확인 필요")}</strong></div>
                <b class="games-facility-distance">${escapeHtml(formatDistance(item))}</b>
              </div>
              <p>${escapeHtml(item.address || item.detail || item.accessibility_note || "세부 정보 확인 필요")}</p>
              <p class="games-facility-meta">공식 자료 · 정보 기준 ${escapeHtml(item.checked_at || "확인 필요")}</p>
              <div class="games-facility-actions">
                ${facilityMapUrl ? `<a href="${escapeHtml(facilityMapUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(item.name || "시설")} 지도 보기, 새 창">지도 보기</a>` : ""}
                ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(item.name || "시설")} 공식 출처 확인, 새 창">공식 출처</a>` : ""}
              </div>
            </article>
          `;
        }).join("")}
      </div>
      ${payload.safety_note ? `<p class="games-resource-warning">${escapeHtml(payload.safety_note)}</p>` : ""}
    `;
  }

  function renderFacilityError() {
    const target = document.getElementById("gamesFacilityResults");
    if (target) {
      target.innerHTML = '<p class="games-facility-status">시설 정보를 불러오지 못했습니다.<button type="button" data-retry-facilities>다시 시도</button></p>';
    }
  }

  async function loadFacilityCache() {
    if (facilityCache) {
      return facilityCache;
    }
    const response = await fetch(FACILITY_DATA_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    facilityCache = payload?.venues && typeof payload.venues === "object" ? payload.venues : {};
    return facilityCache;
  }

  async function loadFacilities(venue) {
    try {
      const cachedByVenue = await loadFacilityCache();
      const cachedPayload = cachedByVenue[venue.id];
      if (cachedPayload) {
        if (selectedVenueId === venue.id) {
          renderFacilityResults(cachedPayload);
        }
        return;
      }
    } catch (error) {
      // Use the live API when the bundled public-data cache is unavailable.
    }

    facilityRequest?.abort();
    facilityRequest = new AbortController();
    try {
      const response = await fetch(FACILITY_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: facilityRequest.signal,
        body: JSON.stringify({
          question: `${venue.name} 주변 장애인 화장실과 전동휠체어 급속충전기를 찾아줘`,
          history: [],
          proximity_request: {
            resource_types: RESOURCE_TYPES,
            latitude: venue.latitude,
            longitude: venue.longitude,
            accuracy_meters: 0,
            limit: 4
          }
        })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      if (selectedVenueId === venue.id) {
        renderFacilityResults(payload);
      }
    } catch (error) {
      if (error.name !== "AbortError" && selectedVenueId === venue.id) {
        renderFacilityError();
      }
    }
  }

  function selectVenue(id, { updateHistory = true, focus = false } = {}) {
    const venue = pageData.venues.find((item) => item.id === id) || pageData.venues[0];
    selectedVenueId = venue.id;
    renderVenueList(venueSearch.value);
    renderVenueDetail(venue);
    loadFacilities(venue);

    if (updateHistory) {
      const url = new URL(window.location.href);
      url.searchParams.set("venue", venue.id);
      window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    if (focus) {
      venueDetail.focus({ preventScroll: true });
      venueDetail.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function renderLoadError() {
    venueList.innerHTML = '<p class="games-empty">경기장 정보를 불러오지 못했습니다.</p>';
    venueDetail.innerHTML = '<div class="games-detail-loading"><strong>대회 안내를 불러오지 못했습니다.</strong><button class="primary-button" type="button" data-retry-page>다시 시도</button></div>';
    overviewContent.innerHTML = '<p class="games-empty">대회 개요를 불러오지 못했습니다.</p>';
    scheduleResults.innerHTML = '<p class="games-empty">전체 경기 일정을 불러오지 못했습니다.</p>';
    contactGrid.innerHTML = '<p class="games-empty">연락처를 불러오지 못했습니다.</p>';
  }

  async function loadData() {
    for (const url of DATA_URLS) {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (response.ok) {
          return response.json();
        }
      } catch (error) {
        // The bundled file remains available when the live API is offline.
      }
    }
    throw new Error("대회 데이터를 불러오지 못했습니다.");
  }

  async function loadPage() {
    try {
      pageData = validateData(await loadData());
      updatedAt.textContent = `정보 기준 ${formatReferenceDate(pageData.updated_at)}`;
      renderEventStatus();
      renderOverview();
      renderSchedule();
      renderContacts();
      renderNotices();
      const requestedVenue = new URLSearchParams(window.location.search).get("venue");
      selectVenue(requestedVenue, { updateHistory: false });
      const url = new URL(window.location.href);
      url.searchParams.set("venue", selectedVenueId);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    } catch (error) {
      renderLoadError();
    }
  }

  venueSearch.addEventListener("input", () => {
    if (pageData) {
      renderVenueList(venueSearch.value);
    }
  });

  scheduleSearch.addEventListener("input", () => {
    if (pageData) {
      renderSchedule();
    }
  });

  [scheduleDate, scheduleScope].forEach((control) => {
    control.addEventListener("change", () => {
      if (pageData) {
        renderSchedule();
      }
    });
  });

  mySportSearch?.addEventListener("input", () => {
    applyMySportQuery(mySportSearch.value);
  });

  mySportForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    applyMySportQuery(mySportSearch.value, { scroll: true, remember: true });
  });

  recentSportList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-recent-sport]");
    if (!button) {
      return;
    }
    mySportSearch.value = button.dataset.recentSport;
    applyMySportQuery(button.dataset.recentSport, { scroll: true, remember: true });
  });

  bottomFindButton?.addEventListener("click", () => {
    focusScheduleSearch();
  });

  scheduleResults.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sport-index]");
    if (!button || !pageData) {
      return;
    }
    selectedScheduleSportIndex = Number(button.dataset.sportIndex);
    rememberSport(pageData.sports[selectedScheduleSportIndex]?.name);
    renderSchedule();
    scheduleResults.querySelector(`[data-sport-index="${selectedScheduleSportIndex}"]`)?.focus();
  });

  scheduleResults.addEventListener("change", (event) => {
    if (event.target.id !== "gamesSportSelect" || !pageData) {
      return;
    }
    selectedScheduleSportIndex = Number(event.target.value);
    rememberSport(pageData.sports[selectedScheduleSportIndex]?.name);
    renderSchedule();
    document.getElementById("gamesSportSelect")?.focus();
  });

  venueList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-venue-id]");
    if (button && pageData) {
      selectVenue(button.dataset.venueId, { focus: true });
    }
  });

  venueDetail.addEventListener("click", (event) => {
    if (event.target.closest("[data-retry-facilities]") && pageData) {
      selectVenue(selectedVenueId, { updateHistory: false });
    }
    if (event.target.closest("[data-retry-page]")) {
      loadPage();
    }
  });

  window.addEventListener("popstate", () => {
    if (pageData) {
      selectVenue(new URLSearchParams(window.location.search).get("venue"), { updateHistory: false });
    }
  });

  renderRecentSports();
  loadPage();
})();
