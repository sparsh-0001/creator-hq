(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const config = window.CREATOR_HQ_CONFIG || {};
  const configured = config.SUPABASE_URL && config.SUPABASE_ANON_KEY &&
    !config.SUPABASE_URL.includes("YOUR_") && !config.SUPABASE_ANON_KEY.includes("YOUR_");
  let supabase = null, creators = [], authMode = "signin", currentView = "creators", displayMode = "table", toastTimer;

  const fields = ["name","platform","handle","profileUrl","city","category","followers","avgViews","engagement","language","reelRate","storyRate","postRate","phone","email","availability","status","notes"];
  const numFields = new Set(["followers","avgViews","engagement","reelRate","storyRate","postRate"]);
  const safe = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const number = (v) => Number(v || 0);
  const money = (v) => v ? "₹" + number(v).toLocaleString("en-IN") : "—";
  const compact = (v) => {
    const n = number(v);
    if (n >= 1e7) return (n/1e7).toFixed(1).replace(/\.0$/,"")+"Cr";
    if (n >= 1e5) return (n/1e5).toFixed(1).replace(/\.0$/,"")+"L";
    if (n >= 1e3) return (n/1e3).toFixed(1).replace(/\.0$/,"")+"K";
    return n.toLocaleString("en-IN");
  };
  const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();
  function toast(message) {
    const el=$("toast"); el.textContent=message; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),2600);
  }
  function setAuthMessage(message, error=true) {
    $("authMessage").textContent=message; $("authMessage").style.color=error?"var(--red)":"var(--green)";
  }
  function showAuth() { $("authScreen").classList.remove("hidden"); $("app").classList.add("hidden"); }
  function showApp(user) {
    $("authScreen").classList.add("hidden"); $("app").classList.remove("hidden");
    $("userEmail").textContent=user.email || "Agency account";
    loadCreators();
  }
  function setAuthMode(mode) {
    authMode=mode;
    $("authSubmit").innerHTML=mode==="signin"?'Sign in <span>↗</span>':'Create account <span>↗</span>';
    $("toggleAuth").textContent=mode==="signin"?"New here? Create an account":"Already have an account? Sign in";
    $("authPassword").autocomplete=mode==="signin"?"current-password":"new-password";
    setAuthMessage("");
  }
  
async function handleAuth(e) {
  e.preventDefault();

  if (!configured) {
    return setAuthMessage("Supabase configuration is missing.");
  }

  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;

  $("authSubmit").disabled = true;
  $("authSubmit").textContent = "Please wait…";
  setAuthMessage("Connecting to Supabase...", false);

  try {
    let result;

    if (authMode === "signin") {
      result = await supabase.auth.signInWithPassword({
        email,
        password
      });
    } else {
      result = await supabase.auth.signUp({
        email,
        password
      });
    }

    console.log("AUTH RESULT:", result);

    if (result.error) {
      throw result.error;
    }

    if (authMode === "signup") {
      if (!result.data.session) {
        setAuthMessage(
          "Account created! Check your email for confirmation.",
          false
        );
      } else {
        setAuthMessage("Account created successfully!", false);
        showApp(result.data.user);
      }
    } else if (result.data.user) {
      showApp(result.data.user);
    }

  } catch (err) {
    console.error("AUTH ERROR:", err);
    setAuthMessage(err.message || "Authentication failed.");
  } finally {
    $("authSubmit").disabled = false;
    $("authSubmit").innerHTML =
      authMode === "signin"
        ? 'Sign in <span>↗</span>'
        : 'Create account <span>↗</span>';
  }
}

  
async function loadCreators() {
  $("creatorTableBody").innerHTML =
    '<tr><td colspan="8">Loading your creator database…</td></tr>';

  try {
    const { data, error } = await supabase
      .schema("public")
      .from("creators")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("CREATOR HQ SUPABASE ERROR:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });

      toast("Database error: " + error.message);
      $("creatorTableBody").innerHTML = "";
      return;
    }

    creators = data || [];
    renderAll();

    $("lastUpdated").textContent =
      "SYNCED · " +
      new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      });

  } catch (err) {
    console.error("CREATOR HQ UNEXPECTED ERROR:", err);
    toast("Unexpected error: " + err.message);
  }
}

  function getFiltered() {
    const q=$("searchInput").value.trim().toLowerCase(), status=$("statusFilter").value, category=$("categoryFilter").value;
    let list=creators.filter(c=>{
      const hay=[c.name,c.handle,c.city,c.category,c.platform,c.email,c.phone].join(" ").toLowerCase();
      return (!q || hay.includes(q)) && (!status || c.status===status) && (!category || c.category===category);
    });
    const sort=$("sortSelect").value;
    if(sort==="name") list.sort((a,b)=>(a.name||"").localeCompare(b.name||""));
    if(sort==="followers") list.sort((a,b)=>number(b.followers)-number(a.followers));
    if(sort==="rate") list.sort((a,b)=>number(a.reel_rate)-number(b.reel_rate));
    if(sort==="newest") list.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    return list;
  }
  function renderAll() {
    const total=creators.length, onboarded=creators.filter(c=>c.status==="Onboarded").length, available=creators.filter(c=>c.availability==="Available").length;
    const categories=new Set(creators.map(c=>c.category).filter(Boolean));
    $("totalCreators").textContent=total; $("onboardedCreators").textContent=onboarded; $("availableCreators").textContent=available; $("categoryCount").textContent=categories.size;
    $("navCreatorCount").textContent=total;
    $("overviewTotal").textContent=total; $("overviewOnboarded").textContent=onboarded; $("overviewAvailable").textContent=available;
    const avg=total?creators.reduce((s,c)=>s+number(c.followers),0)/total:0; $("overviewFollowers").textContent=compact(avg);
    const current=$("categoryFilter").value;
    $("categoryFilter").innerHTML='<option value="">All categories</option>'+[...categories].sort().map(c=>`<option value="${safe(c)}">${safe(c)}</option>`).join("");
    $("categoryFilter").value=current;
    const list=getFiltered(); $("resultCount").textContent=`${list.length} ${list.length===1?"creator":"creators"}`;
    $("emptyState").classList.toggle("hidden",list.length!==0);
    $("tableWrap").classList.toggle("hidden",displayMode!=="table" || list.length===0);
    $("galleryGrid").classList.toggle("hidden",displayMode!=="gallery" || list.length===0);
    $("creatorTableBody").innerHTML=list.map(rowHtml).join("");
    $("galleryGrid").innerHTML=list.map(cardHtml).join("");
    document.querySelectorAll(".view-btn").forEach(b=>b.classList.toggle("active",b.dataset.mode===displayMode));
    $("emptyAddBtn").onclick=openCreateModal;
    $("recentCreators").innerHTML=creators.slice(0,5).map(c=>`<div class="recent-row"><div class="creator-cell"><div class="creator-avatar">${safe(initials(c.name))}</div><div><div class="creator-name">${safe(c.name)}</div><div class="creator-handle">${safe(c.handle||c.platform||"Creator")}</div></div></div><span class="status-pill status-${safe(c.status)}">${safe(c.status)}</span></div>`).join("") || '<div class="empty-state">No creators added yet.</div>';
  }
  function rowHtml(c) {
    const profile=c.profile_url ? `<a class="creator-name" href="${safe(c.profile_url)}" target="_blank" rel="noopener noreferrer">${safe(c.name)} ↗</a>`:`<span class="creator-name">${safe(c.name)}</span>`;
    return `<tr><td><div class="creator-cell"><div class="creator-avatar">${safe(initials(c.name))}</div><div>${profile}<div class="creator-handle">${safe(c.handle||"No handle")} · ${safe(c.city||"Location not set")}</div></div></div></td><td><span class="category-pill">${safe(c.category||"Uncategorized")}</span></td><td>${safe(c.platform||"—")}</td><td>${compact(c.followers)}</td><td>${c.engagement_rate?number(c.engagement_rate).toFixed(2)+"%":"—"}</td><td>${money(c.reel_rate)}</td><td><span class="status-pill status-${safe(c.status)}">${safe(c.status)}</span></td><td><div class="row-actions"><button class="mini-action" data-edit="${c.id}" aria-label="Edit ${safe(c.name)}">Edit</button><button class="mini-action" data-delete="${c.id}" aria-label="Delete ${safe(c.name)}">×</button></div></td></tr>`;
  }
  function cardHtml(c) {
    return `<article class="creator-card"><div class="card-top"><span class="category-pill">${safe(c.category||"Uncategorized")}</span><span class="status-pill status-${safe(c.status)}">${safe(c.status)}</span></div><div class="card-person"><div class="creator-avatar">${safe(initials(c.name))}</div><div><h3>${safe(c.name)}</h3><p>${safe(c.handle||c.platform||"Creator")} · ${safe(c.city||"")}</p></div></div><div class="card-metrics"><div><span>FOLLOWERS</span><strong>${compact(c.followers)}</strong></div><div><span>AVG. VIEWS</span><strong>${compact(c.avg_views)}</strong></div><div><span>ENGAGEMENT</span><strong>${c.engagement_rate?number(c.engagement_rate).toFixed(2)+"%":"—"}</strong></div><div><span>REEL RATE</span><strong>${money(c.reel_rate)}</strong></div></div><div class="card-bottom"><small class="muted">${safe(c.platform||"")}</small><div class="row-actions"><button class="mini-action" data-edit="${c.id}">Edit</button><button class="mini-action" data-delete="${c.id}">Delete</button></div></div></article>`;
  }
  function openCreateModal() { $("creatorForm").reset(); $("creatorId").value=""; $("modalTitle").textContent="Add a creator."; $("formError").textContent=""; $("modalBackdrop").classList.remove("hidden"); document.body.style.overflow="hidden"; }
  function openEditModal(id) {
    const c=creators.find(x=>String(x.id)===String(id)); if(!c) return;
    $("creatorForm").reset(); $("creatorId").value=c.id; $("modalTitle").textContent="Edit creator.";
    const map={profileUrl:"profile_url",avgViews:"avg_views",engagement:"engagement_rate",reelRate:"reel_rate",storyRate:"story_rate",postRate:"post_rate"};
    fields.forEach(f=>{const key=map[f]||f; const el=$(f); if(el) el.value=c[key]??"";});
    $("formError").textContent=""; $("modalBackdrop").classList.remove("hidden"); document.body.style.overflow="hidden";
  }
  function closeModal() { $("modalBackdrop").classList.add("hidden"); document.body.style.overflow=""; }
  async function saveCreator(e) {
    e.preventDefault(); $("formError").textContent="";
    const payload={};
    const map={profileUrl:"profile_url",avgViews:"avg_views",engagement:"engagement_rate",reelRate:"reel_rate",storyRate:"story_rate",postRate:"post_rate"};
    fields.forEach(f=>{const key=map[f]||f; const value=$(f).value.trim(); payload[key]=numFields.has(f)?(value===""?null:Number(value)):(value||null);});
    if(!payload.name) return $("formError").textContent="Creator name is required.";
    if(payload.profile_url && !/^https?:\/\//i.test(payload.profile_url)) return $("formError").textContent="Profile URL must start with http:// or https://.";
    const id=$("creatorId").value; const button=$("saveCreator"); button.disabled=true; button.textContent="Saving…";
    try {
      const result=id
        ? await supabase.from("creators").update(payload).eq("id",id).select().single()
        : await supabase.from("creators").insert(payload).select().single();
      if(result.error) throw result.error;
      closeModal(); toast(id?"Creator updated.":"Creator added."); await loadCreators();
    } catch(err) { $("formError").textContent=err.message||"Could not save creator."; }
    finally {button.disabled=false;button.innerHTML='Save creator <span>↗</span>';}
  }
  async function deleteCreator(id) {
    const c=creators.find(x=>String(x.id)===String(id)); if(!c) return;
    if(!confirm(`Delete ${c.name} from your creator database? This cannot be undone.`)) return;
    const {error}=await supabase.from("creators").delete().eq("id",id);
    if(error) return toast("Delete failed: "+error.message);
    toast("Creator deleted."); loadCreators();
  }
  function exportCsv() {
    const list=getFiltered(); if(!list.length) return toast("There are no records to export.");
    const cols=[["Name","name"],["Platform","platform"],["Handle","handle"],["Profile URL","profile_url"],["City","city"],["Category","category"],["Followers","followers"],["Average Views","avg_views"],["Engagement Rate","engagement_rate"],["Language","language"],["Reel Rate","reel_rate"],["Story Rate","story_rate"],["Post Rate","post_rate"],["Phone","phone"],["Email","email"],["Availability","availability"],["Status","status"],["Notes","notes"]];
    const quote=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
    const csv=[cols.map(x=>quote(x[0])).join(","),...list.map(c=>cols.map(x=>quote(c[x[1]])).join(","))].join("\r\n");
    const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="creator-hq-database.csv";a.click();URL.revokeObjectURL(url);toast("CSV export prepared.");
  }
  function switchView(view) {
    currentView=view; $("creatorsView").classList.toggle("hidden",view!=="creators"); $("overviewView").classList.toggle("hidden",view!=="overview");
    $("breadcrumbCurrent").textContent=view==="creators"?"Creators":"Overview";
    document.querySelectorAll(".nav-item[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  }
  function setupSidebar() {
    const open=()=>{$("sidebar").classList.add("open");$("sidebarScrim").classList.add("show");};
    const close=()=>{$("sidebar").classList.remove("open");$("sidebarScrim").classList.remove("show");};
    $("openSidebar").onclick=open;$("closeSidebar").onclick=close;$("sidebarScrim").onclick=close;
    document.querySelectorAll(".nav-item[data-view]").forEach(b=>b.onclick=()=>{switchView(b.dataset.view);close();});
    $("goCreators").onclick=()=>switchView("creators");
  }
  function init() {
    if(!configured) { showAuth(); setAuthMessage("Setup required: add your Supabase URL and anon key in js/config.js."); }
    else {
      supabase=window.supabase.createClient(config.SUPABASE_URL,config.SUPABASE_ANON_KEY);
      supabase.auth.getSession().then(({data})=>data.session?showApp(data.session.user):showAuth());
      supabase.auth.onAuthStateChange((_event,session)=>{if(session)showApp(session.user);else showAuth();});
    }
    $("authForm").addEventListener("submit",handleAuth);
    $("toggleAuth").onclick=()=>setAuthMode(authMode==="signin"?"signup":"signin");
    $("signOut").onclick=async()=>{if(supabase) await supabase.auth.signOut();};
    $("addCreatorBtn").onclick=openCreateModal;$("closeModal").onclick=closeModal;$("cancelModal").onclick=closeModal;
    $("modalBackdrop").addEventListener("click",e=>{if(e.target===$("modalBackdrop"))closeModal();});
    $("creatorForm").addEventListener("submit",saveCreator);
    ["searchInput","statusFilter","categoryFilter","sortSelect"].forEach(id=>$(id).addEventListener(id==="searchInput"?"input":"change",renderAll));
    document.querySelectorAll(".view-btn").forEach(b=>b.onclick=()=>{displayMode=b.dataset.mode;renderAll();});
    $("exportCsv").onclick=exportCsv;
    document.addEventListener("click",e=>{const edit=e.target.closest("[data-edit]"),del=e.target.closest("[data-delete]");if(edit)openEditModal(edit.dataset.edit);if(del)deleteCreator(del.dataset.delete);});
    setupSidebar();
  }
  document.addEventListener("DOMContentLoaded",init);
})();