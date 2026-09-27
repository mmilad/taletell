import { createRoot } from "react-dom/client";
import "./styles.css";
import { projectApi } from "./api/client";
import { publicAssetRef, summarizeStory, type StorySummary } from "./api/store";
import {
  analyzeStory,
  createId,
  normalizeProject,
  type Project,
  type Scene,
} from "./domain";
import {
  characterVisualPrompt,
  generateCharacter,
  generateLocation,
  generateScene,
  keyCharacters,
  locationVisualPrompt,
  missingKeyExamples,
  sceneReferenceCast,
  sceneVisualPrompt,
  type StoryAge,
  type StoryTone,
} from "./generate";
import {
  displayImageSrc,
  generateImages,
  getImageStatus,
  type ImageStatus,
} from "./image-bridge";
import {
  generateStoryDraft,
  getStoryStatus,
  type StoryStatus,
} from "./story-bridge";

const CURRENT_KEY = "storyteller.currentProjectId";
const LEGACY_KEY = "storyteller.project.v1";
const exampleStory = {
  title: "Milo and the Moonlit Forest",
  sourceText:
    "Milo, a curious little fox, lived beside the moonlit forest. One evening, Milo met Nora, a girl in a yellow raincoat, at the edge of the woods. Together they followed a trail of silver leaves to a quiet pond. A gentle bear named Bram was waiting there with a lantern. The three friends shared stories until the first birds began to sing.",
};
const uid = createId;
type Tab = "story" | "bible" | "scenes";
type AssetKind = "character" | "location" | "scene";

function App() {
  const [project, setProject] = useState<Project>();
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [tab, setTab] = useState<Tab>("story");
  const [saved, setSaved] = useState(true);
  const [formKey, setFormKey] = useState(0);
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const abortors = React.useRef<Record<string, AbortController>>({});
  const projectRef = React.useRef<Project | undefined>(undefined);
  const skipSave = React.useRef(true);
  const [imageStatus, setImageStatus] = useState<ImageStatus>({
    ok: false,
    mode: "mock",
    ready: false,
    detail: "Checking image worker…",
  });
  const [storyStatus, setStoryStatus] = useState<StoryStatus>({
    ok: false,
    mode: "template",
    ready: false,
    detail: "Checking story writer…",
  });
  const [writing, setWriting] = useState(false);
  const writeAbort = React.useRef<AbortController | undefined>(undefined);
  projectRef.current = project;
  const remember = (next: Project, list?: StorySummary[]) => {
    skipSave.current = true;
    localStorage.setItem(CURRENT_KEY, next.id);
    setProject(next);
    setStories(
      (current) =>
        list ?? [
          summarizeStory(next),
          ...current.filter((item) => item.id !== next.id),
        ],
    );
    setSaved(true);
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let list = await projectApi.list();
        if (!list.length) {
          const legacy = localStorage.getItem(LEGACY_KEY);
          if (legacy) {
            try {
              await projectApi.save(
                normalizeProject(JSON.parse(legacy) as Project),
              );
              localStorage.removeItem(LEGACY_KEY);
              list = await projectApi.list();
            } catch {
              /* keep going if the leftover browser draft is invalid */
            }
          }
        }
        if (!list.length) {
          const created = await projectApi.create();
          if (!cancelled) remember(created, [summarizeStory(created)]);
          return;
        }
        const preferred = localStorage.getItem(CURRENT_KEY);
        const chosen = list.find((item) => item.id === preferred) || list[0];
        const loaded = await projectApi.get(chosen.id);
        if (!cancelled) remember(loaded, list);
      } catch (error) {
        if (!cancelled)
          window.alert(
            error instanceof Error
              ? error.message
              : "Could not open the project library.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!project) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    setSaved(false);
    const timer = setTimeout(async () => {
      try {
        const persisted = await projectApi.save(project);
        setStories((current) =>
          current.map((item) =>
            item.id === persisted.id ? summarizeStory(persisted) : item,
          ),
        );
        setSaved(true);
      } catch (error) {
        window.alert(
          error instanceof Error ? error.message : "Could not save the story.",
        );
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [project]);
  useEffect(() => {
    getImageStatus()
      .then(setImageStatus)
      .catch((error) =>
        setImageStatus({
          ok: false,
          mode: "mock",
          ready: false,
          detail:
            error instanceof Error
              ? error.message
              : "Image worker is not available.",
        }),
      );
  }, []);
  useEffect(() => {
    getStoryStatus()
      .then(setStoryStatus)
      .catch((error) =>
        setStoryStatus({
          ok: false,
          mode: "template",
          ready: false,
          detail:
            error instanceof Error
              ? error.message
              : "Story writer is not available.",
        }),
      );
  }, []);
  useEffect(() => {
    const flush = () => {
      const current = projectRef.current;
      if (!current) return;
      void fetch(`/api/projects/${encodeURIComponent(current.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(current),
        keepalive: true,
      });
    };
    window.addEventListener("beforeunload", flush);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  const persistCurrent = async () => {
    if (!projectRef.current) return;
    try {
      await projectApi.save(projectRef.current);
    } catch {
      /* keep the in-memory draft if the API is briefly down */
    }
  };
  const newStory = async () => {
    await persistCurrent();
    remember(await projectApi.create());
    setFormKey((key) => key + 1);
    setTab("story");
  };
  const openStory = async (id: string) => {
    if (project?.id === id) {
      setTab("story");
      return;
    }
    await persistCurrent();
    remember(await projectApi.get(id));
    setFormKey((key) => key + 1);
    setTab("story");
  };
  const deleteStory = async () => {
    if (
      !project ||
      stories.length < 2 ||
      !window.confirm("Delete this story from the library?")
    )
      return;
    await projectApi.remove(project.id);
    const remaining = stories.filter((item) => item.id !== project.id);
    remember(await projectApi.get(remaining[0].id), remaining);
    setFormKey((key) => key + 1);
    setTab("story");
  };
  const patch = (p: Partial<Project>) => {
    setSaved(false);
    setProject((current) => {
      if (!current) return current;
      const next = normalizeProject({
        ...current,
        ...p,
        updatedAt: new Date().toISOString(),
      });
      projectRef.current = next;
      return next;
    });
  };
  const replaceDrafts = () => {
    if (!project) return false;
    const hasDrafts =
      project.characters.length > 0 ||
      project.locations.length > 0 ||
      project.scenes.length > 0;
    return (
      !hasDrafts ||
      window.confirm(
        "Replace the current story modules? Edited characters, places, and scenes will be overwritten.",
      )
    );
  };
  const runAnalysis = () => {
    if (!project?.sourceText.trim() || !replaceDrafts()) return;
    patch(analyzeStory(project.sourceText));
    setTab("bible");
  };
  const runStoryGeneration = async (brief: {
    premise: string;
    tone: StoryTone;
    age: StoryAge;
    reuseCast: boolean;
  }) => {
    if (!project || !brief.premise.trim()) return;
    if (writing) {
      writeAbort.current?.abort();
      return;
    }
    const latest = projectRef.current || project;
    const keepCast =
      brief.reuseCast &&
      (latest.characters.length > 0 || latest.locations.length > 0);
    if (!keepCast && !replaceDrafts()) return;
    const controller = new AbortController();
    writeAbort.current = controller;
    setWriting(true);
    try {
      const generated = await generateStoryDraft(
        {
          premise: brief.premise,
          tone: brief.tone,
          age: brief.age,
          characters: keepCast ? latest.characters : undefined,
          locations: keepCast ? latest.locations : undefined,
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      patch(generated);
      setTab("bible");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      window.alert(
        error instanceof Error ? error.message : "Could not write the story.",
      );
    } finally {
      if (writeAbort.current === controller) {
        writeAbort.current = undefined;
        setWriting(false);
      }
    }
  };
  const generateAsset = async (kind: AssetKind, id: string) => {
    const latest = projectRef.current;
    if (!latest) return;
    if (generating[id]) {
      abortors.current[id]?.abort();
      delete abortors.current[id];
      setGenerating((x) => ({ ...x, [id]: false }));
      return;
    }
    const character =
      kind === "character"
        ? latest.characters.find((item) => item.id === id)
        : undefined;
    const location =
      kind === "location"
        ? latest.locations.find((item) => item.id === id)
        : undefined;
    const scene =
      kind === "scene"
        ? latest.scenes.find((item) => item.id === id)
        : undefined;
    const subject = character || location || scene;
    if (!subject) return;
    if (kind === "scene") {
      const needed = keyCharacters(latest.characters).filter((item) =>
        scene?.characterIds.includes(item.id),
      );
      const missing = missingKeyExamples(needed);
      if (missing.length) {
        window.alert(
          `Generate example sheets first: ${missing.map((item) => item.name).join(", ")}. Scenes should be derived from those.`,
        );
        return;
      }
    }
    const controller = new AbortController();
    abortors.current[id] = controller;
    setGenerating((x) => ({ ...x, [id]: true }));
    try {
      const prompt = character
        ? characterVisualPrompt(character)
        : location
          ? locationVisualPrompt(location)
          : sceneVisualPrompt(scene as Scene, latest);
      const references =
        kind === "scene"
          ? sceneReferenceCast(scene as Scene, latest.characters).flatMap(
              (item) => {
                const filePath =
                  item.imageFile ||
                  (item.selectedImage && !item.selectedImage.startsWith("data:")
                    ? item.selectedImage
                    : undefined);
                return filePath
                  ? [
                      {
                        assetId: item.id,
                        filePath,
                        url: item.selectedImage,
                        role: "identity" as const,
                      },
                    ]
                  : [];
              },
            )
          : undefined;
      const result = await generateImages(
        {
          mode: kind === "scene" ? "composition" : "asset",
          subject: kind,
          prompt,
          variants: 1,
          width: 768,
          height: 768,
          assetId: id,
          references,
        },
        controller.signal,
      );
      const returned = result.images
        .map((image) =>
          publicAssetRef(image.url || image.dataUrl || image.filePath),
        )
        .filter((value): value is string => Boolean(value));
      if (!returned.length)
        throw new Error(
          result.mode === "mock"
            ? "The image worker is still in mock mode. Install the Flux worker venv, then restart pnpm run dev."
            : "Flux finished without saving a PNG.",
        );
      const nextImage = {
        imageStatus: "generated" as const,
        imageVariants: returned,
        selectedImage: returned[0],
        imageFile: publicAssetRef(result.images[0]?.filePath) || returned[0],
      };
      const current = projectRef.current || latest;
      const next = normalizeProject({
        ...current,
        updatedAt: new Date().toISOString(),
        characters:
          kind === "character"
            ? current.characters.map((item) =>
                item.id === id ? { ...item, ...nextImage } : item,
              )
            : current.characters,
        locations:
          kind === "location"
            ? current.locations.map((item) =>
                item.id === id ? { ...item, ...nextImage } : item,
              )
            : current.locations,
        scenes:
          kind === "scene"
            ? current.scenes.map((item) =>
                item.id === id ? { ...item, ...nextImage } : item,
              )
            : current.scenes,
      });
      skipSave.current = true;
      projectRef.current = next;
      setProject(next);
      const persisted = await projectApi.save(next);
      setStories((stories) =>
        stories.map((item) =>
          item.id === persisted.id ? summarizeStory(persisted) : item,
        ),
      );
      setSaved(true);
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      )
        return;
      window.alert(
        error instanceof Error ? error.message : "Image generation failed",
      );
    } finally {
      delete abortors.current[id];
      setGenerating((x) => ({ ...x, [id]: false }));
    }
  };
  const generateKeyExamples = async () => {
    const latest = projectRef.current;
    if (!latest) return;
    for (const character of missingKeyExamples(latest.characters)) {
      await generateAsset("character", character.id);
    }
  };
  const exportProject = () => {
    if (!project) return;
    const blob = new Blob([JSON.stringify(project, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "story"}.story.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const importProject = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        try {
          const incoming = JSON.parse(String(reader.result)) as Project;
          if (!incoming.title || !Array.isArray(incoming.scenes))
            throw new Error("Invalid project");
          await persistCurrent();
          remember(
            await projectApi.save(
              normalizeProject({
                ...incoming,
                id: incoming.id || uid(),
                updatedAt: new Date().toISOString(),
              }),
            ),
          );
          setFormKey((key) => key + 1);
          setTab("story");
        } catch {
          window.alert("That file is not a valid Storyteller project.");
        }
      })();
    };
    reader.readAsText(file);
    event.target.value = "";
  };
  if (!project)
    return (
      <div className="app">
        <header>
          <div className="brand">
            <span className="mark">✦</span>
            <div>
              <strong>Storyteller</strong>
              <small>authoring studio</small>
            </div>
          </div>
          <div className="save">Opening library…</div>
        </header>
        <main>
          <section className="content">
            <p className="lede">Opening the story library…</p>
          </section>
        </main>
      </div>
    );
  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="mark">✦</span>
          <div>
            <strong>Storyteller</strong>
            <small>authoring studio</small>
          </div>
        </div>
        <div className="save">{saved ? "Saved" : "Saving…"}</div>
        <span className={storyStatus.ready ? "pill ready" : "pill"}>
          {storyStatus.ready
            ? `Ollama · ${(storyStatus.model || "local").replace(/:latest$/, "")}`
            : writing
              ? "Writing…"
              : "Template stories"}
        </span>
        <span className={imageStatus.ready ? "pill ready" : "pill"}>
          {imageStatus.ready
            ? `Flux · ${imageStatus.gpu || imageStatus.device || "ready"}`
            : imageStatus.mode === "real"
              ? "Flux starting…"
              : "Mock images"}
        </span>
        <button
          className="primary"
          onClick={() => {
            void newStory();
          }}
        >
          New story
        </button>
      </header>
      <main>
        <aside>
          <div className="stories-heading">
            <p className="eyebrow">STORIES</p>
            <button
              className="new-story"
              onClick={() => {
                void newStory();
              }}
            >
              ＋ New story
            </button>
          </div>
          <div className="story-list">
            {stories.map((item) => (
              <button
                key={item.id}
                className={
                  item.id === project.id ? "story-item selected" : "story-item"
                }
                onClick={() => {
                  void openStory(item.id);
                }}
              >
                <span className="story-dot">✦</span>
                <span>{item.title || "Untitled story"}</span>
              </button>
            ))}
          </div>
          <div className="story-workspace">
            <p className="eyebrow">CURRENT STORY</p>
            <button
              className={tab === "story" ? "nav active" : "nav"}
              onClick={() => setTab("story")}
            >
              ▣ <span>Story</span>
            </button>
            <button
              className={tab === "bible" ? "nav active" : "nav"}
              onClick={() => setTab("bible")}
            >
              ◈ <span>Story bible</span>
              <i>
                {project.characters.length + project.locations.length || ""}
              </i>
            </button>
            <button
              className={tab === "scenes" ? "nav active" : "nav"}
              onClick={() => setTab("scenes")}
            >
              ▤ <span>Scenes</span>
              <i>{project.scenes.length || ""}</i>
            </button>
          </div>
          <div className="side-note">
            <span>PROJECT API</span>
            <p>
              Stories are saved through the project API. SQLite is the first
              store; the database can be replaced without changing this UI.
            </p>
            <div className="project-actions">
              <button onClick={exportProject}>Export project</button>
              <label>
                Import project
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={importProject}
                />
              </label>
              {stories.length > 1 && (
                <button
                  onClick={() => {
                    void deleteStory();
                  }}
                >
                  Delete story
                </button>
              )}
            </div>
          </div>
        </aside>
        <section className="content">
          {tab === "story" && (
            <Story
              key={formKey}
              project={project}
              patch={patch}
              analyze={runAnalysis}
              generate={runStoryGeneration}
              writing={writing}
              storyStatus={storyStatus}
              loadExample={() => {
                patch({
                  ...exampleStory,
                  characters: [],
                  locations: [],
                  scenes: [],
                });
                setTab("story");
              }}
            />
          )}
          {tab === "bible" && (
            <Bible
              project={project}
              patch={patch}
              generateAsset={generateAsset}
              generateKeyExamples={generateKeyExamples}
              generating={generating}
              imageStatus={imageStatus}
              goScenes={() => setTab("scenes")}
            />
          )}
          {tab === "scenes" && (
            <Scenes
              project={project}
              patch={patch}
              generateAsset={generateAsset}
              generateKeyExamples={generateKeyExamples}
              generating={generating}
              imageStatus={imageStatus}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function Story({
  project,
  patch,
  analyze,
  generate,
  writing,
  storyStatus,
  loadExample,
}: {
  project: Project;
  patch: (p: Partial<Project>) => void;
  analyze: () => void;
  generate: (brief: {
    premise: string;
    tone: StoryTone;
    age: StoryAge;
    reuseCast: boolean;
  }) => void;
  writing: boolean;
  storyStatus: StoryStatus;
  loadExample: () => void;
}) {
  const [premise, setPremise] = useState(
    project.sourceText ? `A story like: ${project.title}` : "",
  );
  const [tone, setTone] = useState<StoryTone>("gentle");
  const [age, setAge] = useState<StoryAge>("5-7");
  const [reuseCast, setReuseCast] = useState(false);
  const hasModules =
    project.characters.length > 0 || project.locations.length > 0;
  const writer = storyStatus.ready
    ? `Ollama · ${(storyStatus.model || "local").replace(/:latest$/, "")}`
    : "Template writer";
  return (
    <>
      <div className="hero">
        <p className="eyebrow">A NEW STORY</p>
        <h1>
          Generate a story from
          <br />
          <em>modular pieces.</em>
        </h1>
        <p className="lede">
          Start with a premise, or paste words you already have. Storyteller
          builds reusable characters, places, and scenes you can keep editing.
        </p>
      </div>
      <div className="card input-card">
        <label>STORY PREMISE</label>
        <textarea
          value={premise}
          onChange={(e) => setPremise(e.target.value)}
          placeholder="A shy rabbit who wants to sing at the village fair…"
        />
        <div className="choice-row">
          <div>
            <span className="choice-label">TONE</span>
            <div className="chips">
              {(["gentle", "adventurous", "funny"] as StoryTone[]).map(
                (value) => (
                  <button
                    key={value}
                    className={tone === value ? "chip active" : "chip"}
                    onClick={() => setTone(value)}
                  >
                    {value}
                  </button>
                ),
              )}
            </div>
          </div>
          <div>
            <span className="choice-label">AGES</span>
            <div className="chips">
              {(["3-5", "5-7", "7-9"] as StoryAge[]).map((value) => (
                <button
                  key={value}
                  className={age === value ? "chip active" : "chip"}
                  onClick={() => setAge(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </div>
        {hasModules && (
          <label className="reuse">
            <input
              type="checkbox"
              checked={reuseCast}
              onChange={(e) => setReuseCast(e.target.checked)}
            />{" "}
            Write the new story with the current character and place modules
          </label>
        )}
        <div className="card-footer">
          <span>
            {writing
              ? "Writing the story…"
              : `${premise.trim().split(/\s+/).filter(Boolean).length} words · ${writer}`}
          </span>
          <button
            className="primary"
            disabled={!writing && !premise.trim()}
            onClick={() => generate({ premise, tone, age, reuseCast })}
          >
            {writing ? (
              "Cancel"
            ) : (
              <>
                Generate story <span>→</span>
              </>
            )}
          </button>
        </div>
      </div>
      <div className="card input-card">
        <label>STORY TITLE</label>
        <input
          value={project.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="The title of your story"
        />
        <label>ORIGINAL STORY TEXT</label>
        <textarea
          value={project.sourceText}
          onChange={(e) => patch({ sourceText: e.target.value })}
          placeholder="Paste a children's story here…"
        />
        <div className="card-footer">
          <span>
            {project.sourceText.trim().split(/\s+/).filter(Boolean).length}{" "}
            words
          </span>
          <div className="story-actions">
            <button className="ghost" onClick={loadExample}>
              Load example
            </button>
            <button
              className="primary"
              disabled={!project.sourceText.trim()}
              onClick={analyze}
            >
              Analyze story <span>→</span>
            </button>
          </div>
        </div>
      </div>
      <div className="tip">
        <span>✦</span>
        <p>
          <strong>How it works</strong>
          <br />
          {storyStatus.ready
            ? "A local Ollama model writes the story into editable character, place, and scene modules."
            : "Start Ollama to write with a local model; until then, Generate story uses the template writer."}{" "}
          Nothing is locked until you keep it.
        </p>
      </div>
    </>
  );
}

function Bible({
  project,
  patch,
  generateAsset,
  generateKeyExamples,
  generating,
  imageStatus,
  goScenes,
}: {
  project: Project;
  patch: (p: Partial<Project>) => void;
  generateAsset: (kind: AssetKind, id: string) => void;
  generateKeyExamples: () => void;
  generating: Record<string, boolean>;
  imageStatus: ImageStatus;
  goScenes: () => void;
}) {
  const [characterPrompt, setCharacterPrompt] = useState("");
  const [locationPrompt, setLocationPrompt] = useState("");
  const addCharacter = () => {
    if (!characterPrompt.trim()) return;
    patch({
      characters: [...project.characters, generateCharacter(characterPrompt)],
    });
    setCharacterPrompt("");
  };
  const addLocation = () => {
    if (!locationPrompt.trim()) return;
    patch({
      locations: [...project.locations, generateLocation(locationPrompt)],
    });
    setLocationPrompt("");
  };
  const missing = missingKeyExamples(project.characters);
  const busy = Object.values(generating).some(Boolean);
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">STORY BIBLE</p>
          <h2>Lock the cast first.</h2>
          <p>
            Extracted key characters need isolated example sheets. Scenes should
            be derived from those, not invented again.{" "}
            {missing.length
              ? `Still need examples for ${missing.map((character) => character.name).join(", ")}.`
              : "Key examples are ready — scenes can reuse them."}
          </p>
        </div>
        <button
          className="ghost"
          onClick={() => patch({ characters: [], locations: [], scenes: [] })}
        >
          Clear drafts
        </button>
      </div>
      <div className="grid two">
        <Entity
          title="Characters"
          count={project.characters.length}
          empty="No characters yet. Generate a module or analyze a story."
          action={
            <ModuleForm
              placeholder="a shy rabbit named Pip with a blue scarf"
              value={characterPrompt}
              onChange={setCharacterPrompt}
              onSubmit={addCharacter}
              label="Generate character"
            />
          }
        >
          {project.characters.map((character) => (
            <ModuleCard
              key={character.id}
              eyebrow={`${character.key ? "Key · " : ""}${character.role}`}
              name={character.name}
              description={character.description}
              appearance={character.appearance}
              traits={character.traits}
              imageStatus={character.imageStatus}
              imageVariants={character.imageVariants}
              selectedImage={character.selectedImage}
              generating={Boolean(generating[character.id])}
              generateLabel="Generate example"
              regenerateLabel="Regenerate example"
              onName={(name) =>
                patch({
                  characters: project.characters.map((item) =>
                    item.id === character.id ? { ...item, name } : item,
                  ),
                })
              }
              onDescription={(description) =>
                patch({
                  characters: project.characters.map((item) =>
                    item.id === character.id ? { ...item, description } : item,
                  ),
                })
              }
              onAppearance={(appearance) =>
                patch({
                  characters: project.characters.map((item) =>
                    item.id === character.id ? { ...item, appearance } : item,
                  ),
                })
              }
              onRemove={() =>
                patch({
                  characters: project.characters.filter(
                    (item) => item.id !== character.id,
                  ),
                  scenes: project.scenes.map((scene) => ({
                    ...scene,
                    characterIds: scene.characterIds.filter(
                      (id) => id !== character.id,
                    ),
                  })),
                })
              }
              onGenerate={() => generateAsset("character", character.id)}
              onSelectImage={(selectedImage) =>
                patch({
                  characters: project.characters.map((item) =>
                    item.id === character.id
                      ? { ...item, selectedImage }
                      : item,
                  ),
                })
              }
            />
          ))}
        </Entity>
        <Entity
          title="Locations"
          count={project.locations.length}
          empty="No places yet. Generate a location module first."
          action={
            <ModuleForm
              placeholder="a lantern village with a tiny stage"
              value={locationPrompt}
              onChange={setLocationPrompt}
              onSubmit={addLocation}
              label="Generate place"
            />
          }
        >
          {project.locations.map((location) => (
            <ModuleCard
              key={location.id}
              eyebrow="Place"
              name={location.name}
              description={location.description}
              imageStatus={location.imageStatus}
              imageVariants={location.imageVariants}
              selectedImage={location.selectedImage}
              generating={Boolean(generating[location.id])}
              generateLabel="Generate view"
              regenerateLabel="Regenerate view"
              onName={(name) =>
                patch({
                  locations: project.locations.map((item) =>
                    item.id === location.id ? { ...item, name } : item,
                  ),
                })
              }
              onDescription={(description) =>
                patch({
                  locations: project.locations.map((item) =>
                    item.id === location.id ? { ...item, description } : item,
                  ),
                })
              }
              onRemove={() =>
                patch({
                  locations: project.locations.filter(
                    (item) => item.id !== location.id,
                  ),
                  scenes: project.scenes.map((scene) =>
                    scene.locationId === location.id
                      ? { ...scene, locationId: undefined }
                      : scene,
                  ),
                })
              }
              onGenerate={() => generateAsset("location", location.id)}
              onSelectImage={(selectedImage) =>
                patch({
                  locations: project.locations.map((item) =>
                    item.id === location.id ? { ...item, selectedImage } : item,
                  ),
                })
              }
            />
          ))}
        </Entity>
      </div>
      <div className="continue">
        <span>
          {missing.length
            ? "Next: make example sheets for the key cast"
            : "Next: derive scenes from those examples"}
        </span>
        {missing.length ? (
          <button
            className="primary"
            disabled={busy}
            onClick={generateKeyExamples}
          >
            {busy ? "Generating examples…" : "Generate key examples →"}
          </button>
        ) : (
          <button className="primary" onClick={goScenes}>
            Review scenes →
          </button>
        )}
      </div>
    </>
  );
}

function Scenes({
  project,
  patch,
  generateAsset,
  generateKeyExamples,
  generating,
  imageStatus,
}: {
  project: Project;
  patch: (p: Partial<Project>) => void;
  generateAsset: (kind: AssetKind, id: string) => void;
  generateKeyExamples: () => void;
  generating: Record<string, boolean>;
  imageStatus: ImageStatus;
}) {
  const [beat, setBeat] = useState("");
  const [picked, setPicked] = useState<string[]>(
    project.characters.slice(0, 2).map((character) => character.id),
  );
  const [placeId, setPlaceId] = useState(project.locations[0]?.id || "");
  const desktop = Boolean(window.storyteller);
  const compose = () => {
    if (!beat.trim()) return;
    const characters = project.characters.filter((character) =>
      picked.includes(character.id),
    );
    const location = project.locations.find(
      (location) => location.id === placeId,
    );
    patch({
      scenes: [
        ...project.scenes,
        generateScene({
          beat,
          order: project.scenes.length,
          characters,
          location,
        }),
      ],
    });
    setBeat("");
  };
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">SCENES</p>
          <h2>Derive moments from the examples.</h2>
          <p>
            {missingKeyExamples(project.characters).length
              ? `Generate key examples first: ${missingKeyExamples(
                  project.characters,
                )
                  .map((character) => character.name)
                  .join(", ")}.`
              : "Each scene reuses the locked character examples."}{" "}
            {Object.values(generating).some(Boolean)
              ? "Encoding the prompt first — Cancel unlocks the button."
              : ""}
          </p>
        </div>
        <span className="pill">{project.scenes.length} scenes</span>
      </div>
      {missingKeyExamples(project.characters).length > 0 && (
        <div className="card input-card scene-compose">
          <div className="card-footer">
            <span>Scenes stay empty until the cast examples exist.</span>
            <button
              className="primary"
              disabled={Object.values(generating).some(Boolean)}
              onClick={generateKeyExamples}
            >
              Generate key examples →
            </button>
          </div>
        </div>
      )}
      <div className="card input-card scene-compose">
        <label>NEW SCENE BEAT</label>
        <textarea
          value={beat}
          onChange={(e) => setBeat(e.target.value)}
          placeholder="They find a silver lantern under the willows…"
        />
        {project.characters.length > 0 && (
          <div className="module-pick">
            <span className="choice-label">CHARACTERS</span>
            <div className="chips">
              {project.characters.map((character) => (
                <button
                  key={character.id}
                  className={
                    picked.includes(character.id) ? "chip active" : "chip"
                  }
                  onClick={() =>
                    setPicked((current) =>
                      current.includes(character.id)
                        ? current.filter((id) => id !== character.id)
                        : [...current, character.id],
                    )
                  }
                >
                  {character.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {project.locations.length > 0 && (
          <div className="module-pick">
            <span className="choice-label">PLACE</span>
            <div className="chips">
              {project.locations.map((location) => (
                <button
                  key={location.id}
                  className={placeId === location.id ? "chip active" : "chip"}
                  onClick={() => setPlaceId(location.id)}
                >
                  {location.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="card-footer">
          <span>Uses the current modules</span>
          <button className="primary" disabled={!beat.trim()} onClick={compose}>
            Generate scene <span>→</span>
          </button>
        </div>
      </div>
      {project.scenes.length === 0 ? (
        <div className="card empty large">
          Generate a story, analyze a story, or compose a scene from modules.
        </div>
      ) : (
        <div className="scene-list">
          {project.scenes.map((scene, index) => (
            <div className="card scene" key={scene.id}>
              <div className="scene-num">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="scene-main">
                <textarea
                  className="scene-summary"
                  value={scene.summary}
                  onChange={(e) =>
                    patch({
                      scenes: project.scenes.map((item) =>
                        item.id === scene.id
                          ? { ...item, summary: e.target.value }
                          : item,
                      ),
                    })
                  }
                />
                <p className="source">{scene.sourceText}</p>
                <p className="module-refs">
                  {project.characters
                    .filter((character) =>
                      scene.characterIds.includes(character.id),
                    )
                    .map((character) => character.name)
                    .join(" · ") || "No characters"}
                  {scene.locationId
                    ? ` · ${project.locations.find((location) => location.id === scene.locationId)?.name || "Place"}`
                    : ""}
                </p>
                <label>VISUAL DESCRIPTION</label>
                <textarea
                  value={scene.visualDescription}
                  onChange={(e) =>
                    patch({
                      scenes: project.scenes.map((item) =>
                        item.id === scene.id
                          ? { ...item, visualDescription: e.target.value }
                          : item,
                      ),
                    })
                  }
                />
                <VariantGrid
                  variants={scene.imageVariants}
                  selected={scene.selectedImage}
                  onSelect={(selectedImage) =>
                    patch({
                      scenes: project.scenes.map((item) =>
                        item.id === scene.id
                          ? { ...item, selectedImage }
                          : item,
                      ),
                    })
                  }
                />
                <div className="scene-actions">
                  {generating[scene.id] ? (
                    <button
                      className="ghost"
                      onClick={() => generateAsset("scene", scene.id)}
                    >
                      Cancel
                    </button>
                  ) : scene.imageStatus === "generated" ? (
                    <button
                      className="ghost"
                      onClick={() => generateAsset("scene", scene.id)}
                    >
                      Regenerate variants
                    </button>
                  ) : (
                    <button
                      className="primary"
                      onClick={() => generateAsset("scene", scene.id)}
                    >
                      {imageStatus.ready
                        ? "Generate Flux images"
                        : "Generate images"}
                    </button>
                  )}
                  <button
                    className="ghost"
                    onClick={() =>
                      patch({
                        scenes: project.scenes.filter(
                          (item) => item.id !== scene.id,
                        ),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Entity({
  title,
  count,
  empty,
  action,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card entity-card">
      <div className="section-title">
        <h3>{title}</h3>
        <span>{count}</span>
      </div>
      {action}
      {count ? children : <div className="empty">{empty}</div>}
    </div>
  );
}
function ModuleForm({
  placeholder,
  value,
  onChange,
  onSubmit,
  label,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  label: string;
}) {
  return (
    <div className="module-form">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
        }}
      />
      <button className="ghost" disabled={!value.trim()} onClick={onSubmit}>
        {label}
      </button>
    </div>
  );
}
function ModuleCard({
  eyebrow,
  name,
  description,
  appearance,
  traits,
  imageStatus,
  imageVariants,
  selectedImage,
  generating,
  generateLabel = "Generate portrait",
  regenerateLabel = "Regenerate portrait",
  onName,
  onDescription,
  onAppearance,
  onRemove,
  onGenerate,
  onSelectImage,
}: {
  eyebrow: string;
  name: string;
  description: string;
  appearance?: string;
  traits?: string[];
  imageStatus: Scene["imageStatus"];
  imageVariants?: string[];
  selectedImage?: string;
  generating: boolean;
  generateLabel?: string;
  regenerateLabel?: string;
  onName: (value: string) => void;
  onDescription: (value: string) => void;
  onAppearance?: (value: string) => void;
  onRemove: () => void;
  onGenerate: () => void;
  onSelectImage: (value: string) => void;
}) {
  return (
    <div className="entity">
      <div className="avatar">{name[0] || "•"}</div>
      <div className="entity-body">
        <input value={name} onChange={(e) => onName(e.target.value)} />
        <small>
          {eyebrow}
          {traits?.length ? ` · ${traits.join(", ")}` : ""}
        </small>
        <textarea
          value={description}
          onChange={(e) => onDescription(e.target.value)}
        />
        {onAppearance && (
          <textarea
            className="appearance"
            value={appearance || ""}
            onChange={(e) => onAppearance(e.target.value)}
            placeholder="Visual identity for every scene"
          />
        )}
        <VariantGrid
          variants={imageVariants}
          selected={selectedImage}
          onSelect={onSelectImage}
        />
        {generating ? (
          <button className="ghost" onClick={onGenerate}>
            Cancel
          </button>
        ) : (
          <button className="ghost" onClick={onGenerate}>
            {imageStatus === "generated" ? regenerateLabel : generateLabel}
          </button>
        )}
      </div>
      <button className="remove" onClick={onRemove}>
        ×
      </button>
    </div>
  );
}
function VariantGrid({
  variants,
  selected,
  onSelect,
}: {
  variants?: string[];
  selected?: string;
  onSelect: (value: string) => void;
}) {
  if (!variants?.length) return null;
  return (
    <div className="preview-grid">
      {variants.map((variant, index) => (
        <button
          className={variant === selected ? "preview selected" : "preview"}
          key={`${variant}-${index}`}
          onClick={() => onSelect(variant)}
        >
          <img src={displayImageSrc(variant)} alt={`Variant ${index + 1}`} />
          <span>{index + 1}</span>
        </button>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
