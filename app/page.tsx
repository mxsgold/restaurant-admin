"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type Dish = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: "Starters" | "Mains" | "Sides" | "Desserts";
  image_path: string | null;
  available: boolean;
  sort_order: number;
};

const CATEGORIES = ["Starters", "Mains", "Sides", "Desserts"] as const;
const ADMIN_EMAIL = "mxsgold@restaurant.local";

function imageUrl(path: string | null) {
  if (!path) return null;
  return supabase.storage.from("dish-images").getPublicUrl(path).data.publicUrl;
}

export default function AdminPage() {
  const [sessionReady, setSessionReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);

  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loadingDishes, setLoadingDishes] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    category: "Mains" as Dish["category"],
    available: true,
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [cropOpen, setCropOpen] = useState(false);
  const [cropImage, setCropImage] = useState<HTMLImageElement | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [draggingCrop, setDraggingCrop] = useState(false);
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropDragRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const email = data.session?.user.email ?? null;
      setUserEmail(email);
      setSessionReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const email = nextSession?.user.email ?? null;
      setUserEmail(email);
      setSessionReady(true);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const isAdmin = userEmail === ADMIN_EMAIL;

  useEffect(() => {
    if (isAdmin) loadDishes();
  }, [isAdmin]);

  const stats = useMemo(() => ({
    total: dishes.length,
    visible: dishes.filter((dish) => dish.available).length,
    hidden: dishes.filter((dish) => !dish.available).length,
  }), [dishes]);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setAuthError("");

    const username = login.trim();
    if (username.toLowerCase() !== "mxsgold") {
      setAuthError("Неверный логин или пароль.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password,
    });

    if (error) setAuthError("Неверный логин или пароль.");
    setLoading(false);
  }

  async function loadDishes() {
    setLoadingDishes(true);
    const { data, error } = await supabase
      .from("dishes")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) setMessage(error.message);
    else setDishes((data ?? []) as Dish[]);
    setLoadingDishes(false);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) return;

    const url = URL.createObjectURL(selected);
    const image = new Image();
    image.onload = () => {
      setFile(selected);
      setPreview(url);
      setCropImage(image);
      setCropZoom(1);
      setCropOffset({ x: 0, y: 0 });
      setCropOpen(true);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
    };
    image.src = url;
  }

  function drawCrop() {
    const canvas = cropCanvasRef.current;
    if (!canvas || !cropImage) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = 800;
    const height = 600;
    canvas.width = width;
    canvas.height = height;

    const baseScale = Math.max(width / cropImage.naturalWidth, height / cropImage.naturalHeight);
    const scale = baseScale * cropZoom;
    const drawWidth = cropImage.naturalWidth * scale;
    const drawHeight = cropImage.naturalHeight * scale;
    const x = (width - drawWidth) / 2 + cropOffset.x;
    const y = (height - drawHeight) / 2 + cropOffset.y;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0a0a09";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(cropImage, x, y, drawWidth, drawHeight);
  }

  useEffect(() => {
    if (cropOpen) drawCrop();
  }, [cropOpen, cropImage, cropZoom, cropOffset]);

  function startCropDrag(clientX: number, clientY: number) {
    cropDragRef.current = { x: clientX, y: clientY };
    setDraggingCrop(true);
  }

  function moveCropDrag(clientX: number, clientY: number) {
    if (!draggingCrop) return;
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const dx = (clientX - cropDragRef.current.x) * scaleX;
    const dy = (clientY - cropDragRef.current.y) * scaleY;
    cropDragRef.current = { x: clientX, y: clientY };
    setCropOffset((current) => ({ x: current.x + dx, y: current.y + dy }));
  }

  function endCropDrag() {
    setDraggingCrop(false);
  }

  function cropToFile(): Promise<File | null> {
    return new Promise((resolve) => {
      if (!cropImage) return resolve(null);

      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 900;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);

      const baseScale = Math.max(800 / cropImage.naturalWidth, 600 / cropImage.naturalHeight);
      const scale = baseScale * cropZoom;
      const x = (800 - cropImage.naturalWidth * scale) / 2 + cropOffset.x;
      const y = (600 - cropImage.naturalHeight * scale) / 2 + cropOffset.y;

      ctx.fillStyle = "#0a0a09";
      ctx.fillRect(0, 0, 1200, 900);
      ctx.drawImage(
        cropImage,
        x * 1.5,
        y * 1.5,
        cropImage.naturalWidth * scale * 1.5,
        cropImage.naturalHeight * scale * 1.5
      );

      canvas.toBlob((blob) => {
        resolve(blob ? new File([blob], "dish-cropped.jpg", { type: "image/jpeg" }) : null);
      }, "image/jpeg", 0.9);
    });
  }

  async function applyCrop() {
    const cropped = await cropToFile();
    if (!cropped) return;

    setFile(cropped);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(cropped));
    setCropOpen(false);
    setCropImage(null);
  }

  function cancelCrop() {
    setCropOpen(false);
    setCropImage(null);
    setFile(null);
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    if (!form.name.trim() || !form.price || !file) {
      setMessage("Заполни название, цену и выбери фото.");
      return;
    }

    setLoading(true);

    let imagePath: string | null = null;

    try {
      if (file) {
        const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `dishes/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("dish-images")
          .upload(path, file, {
            cacheControl: "3600",
            contentType: file.type || "image/jpeg",
            upsert: false,
          });

        if (uploadError) throw uploadError;
        imagePath = path;
      }

      const { error } = await supabase.from("dishes").insert({
        name: form.name.trim(),
        description: form.description.trim(),
        price: Number(form.price),
        category: form.category,
        image_path: imagePath,
        available: form.available,
        sort_order: dishes.length,
      });

      if (error) throw error;

      setForm({
        name: "",
        description: "",
        price: "",
        category: "Mains",
        available: true,
      });
      setFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview("");
      const input = document.getElementById("dish-photo") as HTMLInputElement | null;
      if (input) input.value = "";
      setMessage("Блюдо добавлено в меню.");
      await loadDishes();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось добавить блюдо.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleDish(dish: Dish) {
    const { error } = await supabase
      .from("dishes")
      .update({ available: !dish.available })
      .eq("id", dish.id);

    if (error) setMessage(error.message);
    else await loadDishes();
  }

  async function deleteDish(dish: Dish) {
    if (!window.confirm(`Удалить «${dish.name}»?`)) return;

    if (dish.image_path) {
      await supabase.storage.from("dish-images").remove([dish.image_path]);
    }

    const { error } = await supabase.from("dishes").delete().eq("id", dish.id);
    if (error) setMessage(error.message);
    else {
      setMessage("Блюдо удалено.");
      await loadDishes();
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    setDishes([]);
  }

  if (!sessionReady) {
    return <main className="center-screen"><div className="loader">NOIR</div></main>;
  }

  if (!userEmail || !isAdmin) {
    return (
      <main className="auth-shell">
        <div className="auth-glow glow-one" />
        <div className="auth-glow glow-two" />
        <section className="login-card">
          <div className="brand-mark">N</div>
          <p className="eyebrow">NOIR / ADMIN</p>
          <h1>Welcome back.</h1>
          <p className="muted">Управляй меню ресторана из одного места.</p>

          <form onSubmit={handleLogin} className="login-form">
            <label>
              <span>Login</span>
              <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Mxsgold" autoComplete="username" />
            </label>
            <label>
              <span>Password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" autoComplete="current-password" />
            </label>
            {authError && <div className="error">{authError}</div>}
            <button className="primary-btn" disabled={loading}>
              {loading ? "Signing in..." : "Enter dashboard"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <div className="brand-line"><span className="brand-mini">N</span><span>NOIR</span></div>
          <p className="muted small">Restaurant control center</p>
        </div>
        <div className="top-actions">
          <a href="https://restaurant-menu-navy-omega.vercel.app/#menu" target="_blank" rel="noreferrer" className="ghost-btn">Open menu ↗</a>
          <button onClick={logout} className="ghost-btn">Log out</button>
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">DASHBOARD</p>
          <h1>Good evening.</h1>
          <p className="muted">Добавляй блюда, меняй доступность и держи меню актуальным.</p>
        </div>
        <div className="stats">
          <div><strong>{stats.total}</strong><span>All dishes</span></div>
          <div><strong>{stats.visible}</strong><span>On menu</span></div>
          <div><strong>{stats.hidden}</strong><span>Hidden</span></div>
        </div>
      </section>

      <div className="content-grid">
        <section className="panel form-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">NEW DISH</p>
              <h2>Add to menu</h2>
            </div>
            <span className="dot" />
          </div>

          <form onSubmit={handleCreate} className="dish-form">
            <label className="photo-picker">
              <input id="dish-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} />
              {preview ? (
                <img src={preview} alt="Dish preview" />
              ) : (
                <div className="photo-empty">
                  <div className="upload-icon">＋</div>
                  <strong>Choose dish photo</strong>
                  <span>Gallery / Files · JPG, PNG, WEBP</span>
                </div>
              )}
              {preview && <div className="change-photo">Change photo</div>}
            </label>

            <div className="field">
              <span>Name</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Truffle Burrata" />
            </div>

            <div className="two-col">
              <div className="field">
                <span>Price</span>
                <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="24" />
              </div>
              <div className="field">
                <span>Category</span>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Dish["category"] })}>
                  {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                </select>
              </div>
            </div>

            <div className="field">
              <span>Description</span>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short description of the dish..." rows={4} />
            </div>

            <label className="switch-row">
              <div><strong>Show on public menu</strong><span>Customers can see this dish immediately.</span></div>
              <input type="checkbox" checked={form.available} onChange={(e) => setForm({ ...form, available: e.target.checked })} />
            </label>

            {message && <div className="notice">{message}</div>}
            <button className="primary-btn" disabled={loading}>
              {loading ? "Saving..." : "Publish dish"}
            </button>
          </form>
        </section>

        <section className="panel menu-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">LIVE MENU</p>
              <h2>Your dishes</h2>
            </div>
            <button className="refresh" onClick={loadDishes} disabled={loadingDishes}>↻</button>
          </div>

          {loadingDishes ? (
            <div className="empty-state">Loading menu...</div>
          ) : dishes.length === 0 ? (
            <div className="empty-state"><span>✦</span><strong>No dishes yet</strong><p>Add your first dish on the left.</p></div>
          ) : (
            <div className="dish-list">
              {dishes.map((dish) => (
                <article className={`dish-row ${dish.available ? "" : "is-hidden"}`} key={dish.id}>
                  {imageUrl(dish.image_path) ? (
                    <img src={imageUrl(dish.image_path)!} alt={dish.name} />
                  ) : (
                    <div className="no-photo">NOIR</div>
                  )}
                  <div className="dish-info">
                    <div className="dish-title-line"><strong>{dish.name}</strong><span>₼{Number(dish.price).toFixed(2)}</span></div>
                    <small>{dish.category} · {dish.available ? "Visible" : "Hidden"}</small>
                    <p>{dish.description || "No description"}</p>
                  </div>
                  <div className="row-actions">
                    <button onClick={() => toggleDish(dish)}>{dish.available ? "Hide" : "Show"}</button>
                    <button className="danger" onClick={() => deleteDish(dish)}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {cropOpen && cropImage && (
        <div className="crop-backdrop" onClick={(event) => {
          if (event.target === event.currentTarget) cancelCrop();
        }}>
          <section className="crop-modal" role="dialog" aria-modal="true" aria-label="Edit dish photo">
            <div className="crop-head">
              <div>
                <p className="eyebrow">PHOTO EDITOR</p>
                <h2>Crop your photo</h2>
              </div>
              <button type="button" className="modal-x" onClick={cancelCrop} aria-label="Close">×</button>
            </div>

            <p className="crop-help">
              Перетащи фото, чтобы выбрать нужную область. Используй ползунок для увеличения.
            </p>

            <div
              className="crop-stage"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                startCropDrag(event.clientX, event.clientY);
              }}
              onPointerMove={(event) => moveCropDrag(event.clientX, event.clientY)}
              onPointerUp={endCropDrag}
              onPointerCancel={endCropDrag}
              onPointerLeave={() => {
                if (draggingCrop) endCropDrag();
              }}
            >
              <canvas ref={cropCanvasRef} />
              <div className="crop-frame" />
            </div>

            <div className="crop-controls">
              <span>Zoom</span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={cropZoom}
                onChange={(event) => setCropZoom(Number(event.target.value))}
              />
              <strong>{cropZoom.toFixed(1)}×</strong>
            </div>

            <div className="crop-actions">
              <button type="button" className="ghost-btn" onClick={cancelCrop}>Cancel</button>
              <button type="button" className="primary-btn" onClick={applyCrop}>Use this crop</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
