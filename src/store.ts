import {
  doc, getDoc, getDocFromServer, setDoc, deleteDoc, collection,
  query, where, getDocs, updateDoc, onSnapshot, writeBatch, serverTimestamp, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { db } from './firebase';
import type { DiagramDocument, DiagramPage, PresentationSettings, PresentState, DiagramFolder, DiagramFolderInviteInfo, FolderRole } from './types/document';
import type { DiagramNode, ShapeNodeData } from './types/shapes';
import type { DiagramEdge } from './types/edges';
import type { DiagramVariable } from './types/variables';
import type { DiagramComment } from './types/comments';
import { getPageDimensions } from './utils/paperSizes';
import { DEFAULT_ORIENTATION, DEFAULT_PAPER_SIZE } from './constants';
import { buildTemplateThumbnailSvgDataUrl } from './utils/templateThumbnail';

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isDiagramOwner(diagram: DiagramDocument, uid: string): boolean {
  return diagram.ownerId === uid || (diagram.coOwnerIds ?? []).includes(uid);
}

export type DiagramAccessRole = 'edit' | 'comment' | 'present';

// A viewer-tier uid (in `viewerIds`, never `memberIds`) gets either
// present-only or present-plus-comment access depending on this diagram's
// own `publicShareRole` setting — reusing that field (previously declared
// but completely unwired anywhere) as the actual "view and comment" access
// mode toggle, rather than introducing a second uid list. This is a
// CLIENT-SIDE UX gate only (picks which mode DocumentEditor renders) — it
// is not a security boundary; a real access-control guarantee needs a
// Firestore rules backstop, which is outside this repo (no firestore.rules
// file exists in this checkout to verify/edit).
export function getDiagramRole(diagram: DiagramDocument, uid: string): DiagramAccessRole {
  if (isDiagramOwner(diagram, uid) || diagram.memberIds.includes(uid)) return 'edit';
  if ((diagram.viewerIds ?? []).includes(uid)) {
    return diagram.publicShareRole === 'commenter' ? 'comment' : 'present';
  }
  // Unresolved (e.g. reached without an explicit membership entry) — keep
  // today's behavior (full edit) rather than introduce a new block here.
  return 'edit';
}

// ── Diagram CRUD ─────────────────────────────────────────────────────────────

export function subscribeUserDiagrams(uid: string, onChange: (diagrams: DiagramDocument[]) => void): () => void {
  const col = collection(db, 'diagrams');
  const slices: Record<string, Map<string, DiagramDocument>> = {
    owner: new Map(), member: new Map(), coOwner: new Map(), viewer: new Map(),
  };

  function rebuild() {
    const merged = new Map<string, DiagramDocument>();
    for (const slice of Object.values(slices)) {
      for (const [id, d] of slice) merged.set(id, d);
    }
    onChange(Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt));
  }

  const makeUnsub = (sliceKey: string, q: ReturnType<typeof query>) =>
    onSnapshot(q, snap => {
      const slice = slices[sliceKey];
      slice.clear();
      snap.forEach(d => slice.set(d.id, { id: d.id, ...(d.data() as object) } as DiagramDocument));
      rebuild();
    }, () => {});

  const unsubs = [
    makeUnsub('owner',   query(col, where('ownerId',    '==',            uid))),
    makeUnsub('member',  query(col, where('memberIds',  'array-contains', uid))),
    makeUnsub('coOwner', query(col, where('coOwnerIds', 'array-contains', uid))),
    makeUnsub('viewer',  query(col, where('viewerIds',  'array-contains', uid))),
  ];

  return () => unsubs.forEach(u => u());
}

export async function createDiagram(uid: string, name: string, email?: string): Promise<DiagramDocument> {
  const id = crypto.randomUUID();
  const inviteToken = crypto.randomUUID();
  const pageId = crypto.randomUUID();

  const page: DiagramPage = {
    id: pageId,
    name: 'Page 1',
    order: 0,
    paperSize: DEFAULT_PAPER_SIZE,
    orientation: DEFAULT_ORIENTATION,
  };

  const diagram: DiagramDocument = {
    id,
    name,
    ownerId: uid,
    ownerEmail: email ?? '',
    coOwnerIds: [],
    memberIds: [],
    memberEmails: {},
    viewerIds: [],
    inviteToken,
    pageOrder: [pageId],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // The page doc's security rule does a get() on the parent diagram doc, which
  // isn't visible to rule evaluation until the parent write commits — so the
  // diagram (+ invite) must land in its own write before the page doc, not a
  // single atomic batch with it.
  const batch = writeBatch(db);
  batch.set(doc(db, 'diagrams', id), diagram);
  batch.set(doc(db, 'diagramInvites', inviteToken), { diagramId: id, diagramName: name, ownerId: uid });
  await batch.commit();

  await setDoc(doc(db, 'diagrams', id, 'pages', pageId), page);

  return diagram;
}

export async function renameDiagram(diagramId: string, name: string): Promise<void> {
  await updateDoc(doc(db, 'diagrams', diagramId), { name, updatedAt: Date.now() });
}

// Determines what every viewer-tier uid (in `viewerIds`) on this diagram
// gets, per getDiagramRole above — 'viewer' (present-only) or 'commenter'
// (present + can place comment pins).
export async function setDiagramPublicShareRole(diagramId: string, role: 'viewer' | 'commenter'): Promise<void> {
  await updateDoc(doc(db, 'diagrams', diagramId), { publicShareRole: role });
}

// `coverThumbnailUrl` is optional — pass it once a fresh render has been
// uploaded (see Canvas.tsx's cover-designation flow); passing just the page
// id lets the gallery card fall through to its existing text-only display
// until the thumbnail catches up, rather than blocking designation on it.
export async function setCoverPage(diagramId: string, pageId: string | undefined, coverThumbnailUrl?: string): Promise<void> {
  await updateDoc(doc(db, 'diagrams', diagramId), {
    coverPageId: pageId ?? null,
    coverThumbnailUrl: coverThumbnailUrl ?? null,
    updatedAt: Date.now(),
  });
}

export async function updatePresentationSettings(diagramId: string, patch: Partial<PresentationSettings>): Promise<void> {
  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  for (const [key, value] of Object.entries(patch)) updates[`presentationSettings.${key}`] = value;
  await updateDoc(doc(db, 'diagrams', diagramId), updates);
}

// Deliberately does NOT bump `updatedAt` — this fires on every slide
// advance while presenting, which isn't a content edit and shouldn't bump
// the diagram to the top of a "recently edited" list.
export async function updatePresentState(diagramId: string, state: PresentState): Promise<void> {
  await updateDoc(doc(db, 'diagrams', diagramId), { presentState: state });
}

export function subscribeDiagram(diagramId: string, onChange: (diagram: DiagramDocument | null) => void): () => void {
  const ref = doc(db, 'diagrams', diagramId);
  function emit(snap: { exists: () => boolean; id: string; data: () => unknown }) {
    onChange(snap.exists() ? ({ id: snap.id, ...(snap.data() as object) } as DiagramDocument) : null);
  }
  const unsub = onSnapshot(ref, emit);
  // The realtime listener has been observed to occasionally miss a push
  // from another tab/client entirely (seen concretely with Presenter View's
  // cross-tab presentState sync — a page-change navigated from the
  // presenter tab sometimes never arrived at the audience tab's listener,
  // even after several seconds). This periodic re-fetch is a cheap safety
  // net: any missed push self-corrects within a few seconds instead of the
  // subscriber staying silently stale for the rest of the session.
  const pollId = setInterval(() => { getDocFromServer(ref).then(emit).catch(() => {}); }, 3000);
  return () => { unsub(); clearInterval(pollId); };
}

export async function deleteDiagram(diagram: DiagramDocument): Promise<void> {
  await Promise.all([
    deleteDoc(doc(db, 'diagrams', diagram.id)),
    deleteDoc(doc(db, 'diagramInvites', diagram.inviteToken)),
  ]);
  // Note: subcollections (pages/shapes/connectors/variables) are not recursively
  // deleted client-side here — acceptable for v1, revisit with a Cloud Function
  // if orphaned subcollection cost becomes material.
}

// ── Pages ────────────────────────────────────────────────────────────────────

export function subscribePages(diagramId: string, onChange: (pages: DiagramPage[]) => void): () => void {
  const col = collection(db, 'diagrams', diagramId, 'pages');
  return onSnapshot(col, snap => {
    const pages = snap.docs
      .map(d => ({ id: d.id, ...(d.data() as object) } as DiagramPage))
      .sort((a, b) => a.order - b.order);
    onChange(pages);
  });
}

export interface NewPageOptions {
  name?: string;
  paperSize?: string;
  orientation?: 'portrait' | 'landscape';
  customWidth?: number;
  customHeight?: number;
}

// `afterOrder` is the order of the page this one should land immediately
// after (-1 to insert before every page). Any existing page at or past that
// slot gets bumped by one in the same batch, so `order` stays a gapless
// 0..n-1 sequence no matter where the insert happens — subscribePages sorts
// by it, and everything downstream (thumbnail order, Canvas's pageOrigins)
// depends on that invariant holding.
export async function addPage(diagramId: string, pages: DiagramPage[], afterOrder: number, options: NewPageOptions = {}): Promise<DiagramPage> {
  const newOrder = afterOrder + 1;
  const pageId = crypto.randomUUID();
  const page: DiagramPage = {
    id: pageId,
    name: options.name ?? `Page ${newOrder + 1}`,
    order: newOrder,
    paperSize: options.paperSize ?? DEFAULT_PAPER_SIZE,
    orientation: options.orientation ?? DEFAULT_ORIENTATION,
    customWidth: options.customWidth,
    customHeight: options.customHeight,
  };
  const batch = writeBatch(db);
  for (const p of pages) {
    if (p.order >= newOrder) batch.update(doc(db, 'diagrams', diagramId, 'pages', p.id), { order: p.order + 1 });
  }
  batch.set(doc(db, 'diagrams', diagramId, 'pages', pageId), page);
  batch.update(doc(db, 'diagrams', diagramId), { updatedAt: Date.now() });
  await batch.commit();
  return page;
}

export async function updatePage(diagramId: string, pageId: string, patch: Partial<DiagramPage>): Promise<void> {
  await updateDoc(doc(db, 'diagrams', diagramId, 'pages', pageId), patch);
}

// Duplicates one page WITHIN the same diagram — its own `shapes`/`connectors`
// subcollections included, with fresh ids and remapped cross-references.
// Scoped-down sibling of cloneDiagramContent (whole-diagram duplication,
// above): same fresh-id-then-remap approach, but for a single page's content
// rather than every page/variable in the diagram, and inserted right after
// the source page using the exact same order-bump invariant addPage relies
// on (order stays a gapless 0..n-1 sequence).
//
// `destinationPages` is the order-bump list for the NEW page's own kind —
// normally the same list the source page belongs to (a regular page cloned
// among regular pages), but pass the master-pages list instead when cloning
// a regular page INTO master-pages (or vice versa); `forceIsMaster` then
// decides the clone's own `isMaster` flag independently of the source's, so
// a real page can be cloned as a starting point for a new master page.
// `overriddenMasterShapeIds` is always stripped on the clone — it only ever
// means something relative to the ORIGINAL page's own master relationship.
export async function duplicatePage(
  diagramId: string, sourcePage: DiagramPage, destinationPages: DiagramPage[], forceIsMaster?: boolean,
): Promise<DiagramPage> {
  const [shapesSnap, connectorsSnap] = await Promise.all([
    getDocs(collection(db, 'diagrams', diagramId, 'pages', sourcePage.id, 'shapes')),
    getDocs(collection(db, 'diagrams', diagramId, 'pages', sourcePage.id, 'connectors')),
  ]);
  const shapes = shapesSnap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as DiagramNode));
  const connectors = connectorsSnap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as DiagramEdge));
  const shapeIdMap = new Map<string, string>();
  for (const s of shapes) shapeIdMap.set(s.id, crypto.randomUUID());

  const isMaster = forceIsMaster ?? sourcePage.isMaster;
  const newOrder = destinationPages.length > 0 ? Math.max(...destinationPages.map(p => p.order)) + 1 : 0;
  const newPageId = crypto.randomUUID();
  const newPage: DiagramPage = {
    ...sourcePage, id: newPageId, name: `${sourcePage.name} copy`, order: newOrder, isMaster,
    masterPageId: isMaster ? undefined : sourcePage.masterPageId,
    overriddenMasterShapeIds: undefined,
  };

  const batch = writeBatch(db);
  for (const p of destinationPages) {
    if (p.order >= newOrder) batch.update(doc(db, 'diagrams', diagramId, 'pages', p.id), { order: p.order + 1 });
  }
  batch.set(doc(db, 'diagrams', diagramId, 'pages', newPageId), newPage);
  batch.update(doc(db, 'diagrams', diagramId), { updatedAt: Date.now() });

  for (const s of shapes) {
    const newShapeId = shapeIdMap.get(s.id)!;
    const newParentId = s.parentId ? shapeIdMap.get(s.parentId) : undefined;
    const data = { ...(s.data as ShapeNodeData), pageId: newPageId };
    // Cross-page references (link targets into other pages, data-binding
    // variables) still resolve fine as-is — only same-page shape ids
    // (parentId, and a link/dataBinding target that happens to point at a
    // shape being duplicated here) need remapping.
    if (data.link?.targetNodeId && shapeIdMap.has(data.link.targetNodeId)) {
      data.link = { ...data.link, targetNodeId: shapeIdMap.get(data.link.targetNodeId) };
    }
    batch.set(doc(db, 'diagrams', diagramId, 'pages', newPageId, 'shapes', newShapeId), { ...s, id: newShapeId, parentId: newParentId, data });
  }
  for (const e of connectors) {
    const newSource = shapeIdMap.get(e.source);
    const newTarget = shapeIdMap.get(e.target);
    if (!newSource || !newTarget) continue;
    const newEdgeId = crypto.randomUUID();
    batch.set(doc(db, 'diagrams', diagramId, 'pages', newPageId, 'connectors', newEdgeId), { ...e, id: newEdgeId, source: newSource, target: newTarget });
  }
  await batch.commit();

  return newPage;
}

// A master page lives in the same `pages` subcollection as everything else
// (reusing subscribePages/updatePage/deletePage/addPage's shape+connector
// infrastructure unchanged) but is flagged isMaster so it's filtered into
// its own navigable/orderable "Master Pages" list instead of the regular
// page stack. Its `order` is a real, gapless sequence scoped to just the
// master pages (same invariant addPage keeps for regular pages, reindexed
// independently) so multiple masters sort stably and can be drag-reordered;
// paperSize/orientation are real, user-chosen values now too, since a
// master's format determines which regular pages can even be assigned it
// (see PageSettingsPanel's format-filtered master dropdown).
export async function addMasterPage(
  diagramId: string, masterPages: DiagramPage[], afterOrder: number, options: NewPageOptions = {},
): Promise<DiagramPage> {
  const newOrder = afterOrder + 1;
  const pageId = crypto.randomUUID();
  const page: DiagramPage = {
    id: pageId,
    name: options.name ?? `Master ${newOrder + 1}`,
    order: newOrder,
    paperSize: options.paperSize ?? DEFAULT_PAPER_SIZE,
    orientation: options.orientation ?? DEFAULT_ORIENTATION,
    customWidth: options.customWidth,
    customHeight: options.customHeight,
    isMaster: true,
  };
  const batch = writeBatch(db);
  for (const m of masterPages) {
    if (m.order >= newOrder) batch.update(doc(db, 'diagrams', diagramId, 'pages', m.id), { order: m.order + 1 });
  }
  batch.set(doc(db, 'diagrams', diagramId, 'pages', pageId), page);
  batch.update(doc(db, 'diagrams', diagramId), { updatedAt: Date.now() });
  await batch.commit();
  return page;
}

// Clones one live-inherited master shape (and, if it's a group, its full
// descendant subtree) into `childPageId`'s own `shapes` subcollection with
// fresh ids, translated by the same delta Canvas.tsx used to render it
// there, then records the ORIGINAL master shape's id in that one child
// page's overriddenMasterShapeIds so it stops being inherited-rendered on
// THIS page specifically — every other page still using the same master is
// unaffected. Mirrors duplicatePage's fresh-id-then-remap approach, scoped
// to one shape (plus descendants) instead of a whole page.
export async function detachMasterShape(
  diagramId: string, childPageId: string, masterPageId: string, rootMasterShapeId: string,
  translateDelta: { dx: number; dy: number },
): Promise<string> {
  const shapesSnap = await getDocs(collection(db, 'diagrams', diagramId, 'pages', masterPageId, 'shapes'));
  const allMasterShapes = shapesSnap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as DiagramNode));

  const subtreeIds = new Set([rootMasterShapeId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of allMasterShapes) {
      if (s.parentId && subtreeIds.has(s.parentId) && !subtreeIds.has(s.id)) { subtreeIds.add(s.id); grew = true; }
    }
  }
  const subtree = allMasterShapes.filter(s => subtreeIds.has(s.id));
  const idMap = new Map(subtree.map(s => [s.id, crypto.randomUUID()]));

  const batch = writeBatch(db);
  for (const s of subtree) {
    const newId = idMap.get(s.id)!;
    const newParentId = s.parentId ? idMap.get(s.parentId) : undefined;
    const data = { ...(s.data as ShapeNodeData), pageId: childPageId, detachedFromMasterShapeId: s.id };
    // Only the root (parentless) shape carries an absolute, page-relative
    // position that needs translating — a descendant's position is already
    // local to its parent and must be copied through unchanged, same
    // "only top-level shapes move" rule duplicatePage/handleReorderPages... use.
    const position = s.parentId ? s.position : { x: s.position.x + translateDelta.dx, y: s.position.y + translateDelta.dy };
    batch.set(doc(db, 'diagrams', diagramId, 'pages', childPageId, 'shapes', newId), {
      ...s, id: newId, parentId: newParentId, position, data,
    });
  }
  batch.update(doc(db, 'diagrams', diagramId, 'pages', childPageId), {
    overriddenMasterShapeIds: arrayUnion(rootMasterShapeId),
  });
  await batch.commit();
  return idMap.get(rootMasterShapeId)!;
}

export async function reorderPages(diagramId: string, orderedPageIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  orderedPageIds.forEach((pageId, index) => {
    batch.update(doc(db, 'diagrams', diagramId, 'pages', pageId), { order: index });
  });
  await batch.commit();
}

// Cascades into the page's own shapes/connectors/comments subcollections —
// a plain deleteDoc on the page alone (the previous behavior) left those
// orphaned in Firestore forever, since nothing else ever queries/cleans up
// a subcollection whose parent page doc no longer exists. Same chunked-batch
// pattern restoreVersion uses for its own bulk deletes.
export async function deletePage(diagramId: string, pageId: string): Promise<void> {
  const [shapesSnap, connectorsSnap, commentsSnap] = await Promise.all([
    getDocs(collection(db, 'diagrams', diagramId, 'pages', pageId, 'shapes')),
    getDocs(collection(db, 'diagrams', diagramId, 'pages', pageId, 'connectors')),
    getDocs(collection(db, 'diagrams', diagramId, 'pages', pageId, 'comments')),
  ]);
  const refs = [
    ...shapesSnap.docs.map(d => d.ref),
    ...connectorsSnap.docs.map(d => d.ref),
    ...commentsSnap.docs.map(d => d.ref),
    doc(db, 'diagrams', diagramId, 'pages', pageId),
  ];
  const CHUNK = 400;
  for (let i = 0; i < refs.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(i, i + CHUNK)) batch.delete(ref);
    await batch.commit();
  }
}

export function getPageOrigin(pageOrderIndex: number, pageHeight: number, pageGap: number): number {
  return pageOrderIndex * (pageHeight + pageGap);
}

export { getPageDimensions };

// ── Shapes ───────────────────────────────────────────────────────────────────

export function subscribeShapes(
  diagramId: string, pageId: string, onChange: (nodes: DiagramNode[]) => void,
): () => void {
  const col = collection(db, 'diagrams', diagramId, 'pages', pageId, 'shapes');
  return onSnapshot(col, snap => {
    onChange(snap.docs.map(d => d.data() as DiagramNode));
  });
}

export async function saveShape(diagramId: string, pageId: string, node: DiagramNode): Promise<void> {
  await setDoc(doc(db, 'diagrams', diagramId, 'pages', pageId, 'shapes', node.id), node);
}

export async function updateShapePosition(
  diagramId: string, pageId: string, nodeId: string,
  position: { x: number; y: number }, rotation: number | undefined, updatedBy: string,
): Promise<void> {
  await updateDoc(doc(db, 'diagrams', diagramId, 'pages', pageId, 'shapes', nodeId), {
    position, 'data.rotation': rotation, updatedAt: serverTimestamp(), updatedBy,
  });
}

export async function deleteShape(diagramId: string, pageId: string, nodeId: string): Promise<void> {
  await deleteDoc(doc(db, 'diagrams', diagramId, 'pages', pageId, 'shapes', nodeId));
}

// ── Connectors ───────────────────────────────────────────────────────────────

export function subscribeConnectors(
  diagramId: string, pageId: string, onChange: (edges: DiagramEdge[]) => void,
): () => void {
  const col = collection(db, 'diagrams', diagramId, 'pages', pageId, 'connectors');
  return onSnapshot(col, snap => {
    onChange(snap.docs.map(d => d.data() as DiagramEdge));
  });
}

export async function saveConnector(diagramId: string, pageId: string, edge: DiagramEdge): Promise<void> {
  await setDoc(doc(db, 'diagrams', diagramId, 'pages', pageId, 'connectors', edge.id), edge);
}

export async function deleteConnector(diagramId: string, pageId: string, edgeId: string): Promise<void> {
  await deleteDoc(doc(db, 'diagrams', diagramId, 'pages', pageId, 'connectors', edgeId));
}

// ── Comments ─────────────────────────────────────────────────────────────────

export function subscribeComments(diagramId: string, pageId: string, onChange: (comments: DiagramComment[]) => void): () => void {
  const col = collection(db, 'diagrams', diagramId, 'pages', pageId, 'comments');
  return onSnapshot(col, snap => {
    onChange(snap.docs.map(d => d.data() as DiagramComment));
  });
}

export async function saveComment(diagramId: string, pageId: string, comment: DiagramComment): Promise<void> {
  await setDoc(doc(db, 'diagrams', diagramId, 'pages', pageId, 'comments', comment.id), comment);
}

export async function deleteComment(diagramId: string, pageId: string, commentId: string): Promise<void> {
  await deleteDoc(doc(db, 'diagrams', diagramId, 'pages', pageId, 'comments', commentId));
}

// ── Variables (data-bound styling) ──────────────────────────────────────────

export function subscribeVariables(diagramId: string, onChange: (vars: DiagramVariable[]) => void): () => void {
  const col = collection(db, 'diagrams', diagramId, 'variables');
  return onSnapshot(col, snap => {
    onChange(snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as DiagramVariable)));
  });
}

export async function upsertVariable(diagramId: string, variable: DiagramVariable): Promise<void> {
  await setDoc(doc(db, 'diagrams', diagramId, 'variables', variable.id), variable);
}

export async function deleteVariable(diagramId: string, variableId: string): Promise<void> {
  await deleteDoc(doc(db, 'diagrams', diagramId, 'variables', variableId));
}

// ── Invite ───────────────────────────────────────────────────────────────────

export interface DiagramInviteInfo {
  diagramId: string;
  diagramName: string;
}

export async function resolveDiagramInvite(token: string): Promise<DiagramInviteInfo | null> {
  const snap = await getDoc(doc(db, 'diagramInvites', token));
  if (!snap.exists()) return null;
  const d = snap.data();
  return { diagramId: d.diagramId as string, diagramName: d.diagramName as string };
}

export async function joinDiagram(diagramId: string, uid: string, email?: string): Promise<void> {
  const update: Record<string, unknown> = { memberIds: arrayUnion(uid) };
  if (email) update[`memberEmails.${uid}`] = email;
  await updateDoc(doc(db, 'diagrams', diagramId), update);
}

export async function loadUserDiagrams(uid: string): Promise<DiagramDocument[]> {
  const col = collection(db, 'diagrams');
  const snap = await getDocs(query(col, where('ownerId', '==', uid)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as DiagramDocument));
}

// ── Folders ──────────────────────────────────────────────────────────────────
// Ported one-for-one from Simple AIM Kanban's folder system (src/store.ts
// there) for UX/sharing-model consistency across the two sibling apps — same
// Firebase project, but a separate `diagramFolders`/`diagramFolderInvites`
// collection pair so the two apps' folders never mix.

export async function createFolder(uid: string, name: string, email?: string): Promise<DiagramFolder> {
  const id = crypto.randomUUID();
  const inviteToken = crypto.randomUUID();
  const editorInviteToken = crypto.randomUUID();
  const folder: DiagramFolder = {
    id, name, ownerId: uid, ownerEmail: email ?? '',
    memberIds: [], editorIds: [], memberEmails: {}, diagramIds: [],
    inviteToken, editorInviteToken, createdAt: Date.now(),
  };
  await Promise.all([
    setDoc(doc(db, 'diagramFolders', id), folder),
    setDoc(doc(db, 'diagramFolderInvites', inviteToken), {
      folderId: id, folderName: name, ownerEmail: email ?? '', diagramIds: [], role: 'viewer',
    }),
    setDoc(doc(db, 'diagramFolderInvites', editorInviteToken), {
      folderId: id, folderName: name, ownerEmail: email ?? '', diagramIds: [], role: 'editor',
    }),
  ]);
  return folder;
}

export async function deleteFolder(folder: DiagramFolder): Promise<void> {
  const ops = [
    deleteDoc(doc(db, 'diagramFolders', folder.id)),
    deleteDoc(doc(db, 'diagramFolderInvites', folder.inviteToken)),
  ];
  if (folder.editorInviteToken) {
    ops.push(deleteDoc(doc(db, 'diagramFolderInvites', folder.editorInviteToken)));
  }
  await Promise.all(ops);
}

export async function renameFolder(folder: DiagramFolder, name: string): Promise<void> {
  const ops: Promise<void>[] = [
    updateDoc(doc(db, 'diagramFolders', folder.id), { name }),
    updateDoc(doc(db, 'diagramFolderInvites', folder.inviteToken), { folderName: name }),
  ];
  if (folder.editorInviteToken) {
    ops.push(updateDoc(doc(db, 'diagramFolderInvites', folder.editorInviteToken), { folderName: name }));
  }
  await Promise.all(ops);
}

// When a folder with existing members gains a new diagram, every folder
// member/editor needs matching access on that diagram too — otherwise
// "share the folder" wouldn't actually grant access to what's inside it.
export async function addDiagramToFolder(
  folder: DiagramFolder,
  diagramId: string,
  allDiagrams: DiagramDocument[],
): Promise<void> {
  const newIds = [...new Set([...folder.diagramIds, diagramId])];
  const inviteOps: Promise<void>[] = [
    updateDoc(doc(db, 'diagramFolders', folder.id), { diagramIds: newIds }),
    updateDoc(doc(db, 'diagramFolderInvites', folder.inviteToken), { diagramIds: newIds }),
  ];
  if (folder.editorInviteToken) {
    inviteOps.push(updateDoc(doc(db, 'diagramFolderInvites', folder.editorInviteToken), { diagramIds: newIds }));
  }
  await Promise.all(inviteOps);
  if (folder.memberIds.length > 0) {
    const diagram = allDiagrams.find(d => d.id === diagramId);
    if (diagram && diagram.ownerId === folder.ownerId) {
      const editorIds = folder.editorIds ?? [];
      await Promise.all(folder.memberIds.map(memberId => {
        const memberEmail = folder.memberEmails?.[memberId];
        const isEditor = editorIds.includes(memberId);
        const update: Record<string, unknown> = isEditor
          ? { memberIds: arrayUnion(memberId) }
          : { viewerIds: arrayUnion(memberId) };
        if (memberEmail) update[`memberEmails.${memberId}`] = memberEmail;
        return updateDoc(doc(db, 'diagrams', diagramId), update).catch(() => {});
      }));
    }
  }
}

export async function removeDiagramFromFolder(folder: DiagramFolder, diagramId: string): Promise<void> {
  const newIds = folder.diagramIds.filter(id => id !== diagramId);
  await Promise.all([
    updateDoc(doc(db, 'diagramFolders', folder.id), { diagramIds: newIds }),
    updateDoc(doc(db, 'diagramFolderInvites', folder.inviteToken), { diagramIds: newIds }),
  ]);
}

export function subscribeUserFolders(uid: string, onChange: (folders: DiagramFolder[]) => void): () => void {
  const col = collection(db, 'diagramFolders');
  const slices: Record<string, Map<string, DiagramFolder>> = {
    owner: new Map(), member: new Map(),
  };

  function rebuild() {
    const merged = new Map<string, DiagramFolder>();
    for (const slice of Object.values(slices)) {
      for (const [id, f] of slice) merged.set(id, f);
    }
    onChange(Array.from(merged.values()).sort((a, b) => a.createdAt - b.createdAt));
  }

  const makeUnsub = (sliceKey: string, q: ReturnType<typeof query>) =>
    onSnapshot(q, snap => {
      const slice = slices[sliceKey];
      slice.clear();
      snap.forEach(d => slice.set(d.id, { id: d.id, ...(d.data() as object) } as DiagramFolder));
      rebuild();
    }, () => {});

  const unsubs = [
    makeUnsub('owner', query(col, where('ownerId', '==', uid))),
    makeUnsub('member', query(col, where('memberIds', 'array-contains', uid))),
  ];
  return () => unsubs.forEach(u => u());
}

export async function resolveFolderInvite(token: string): Promise<DiagramFolderInviteInfo | null> {
  const snap = await getDoc(doc(db, 'diagramFolderInvites', token));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    folderId: d.folderId as string,
    folderName: d.folderName as string,
    ownerEmail: d.ownerEmail as string,
    diagramIds: (d.diagramIds as string[]) ?? [],
    role: (d.role as FolderRole | undefined) ?? 'viewer',
  };
}

export async function joinFolder(
  folderId: string,
  uid: string,
  email?: string,
  diagramIds: string[] = [],
  role: 'editor' | 'viewer' = 'viewer',
): Promise<void> {
  const folderUpdate: Record<string, unknown> = { memberIds: arrayUnion(uid) };
  if (role === 'editor') folderUpdate.editorIds = arrayUnion(uid);
  if (email) folderUpdate[`memberEmails.${uid}`] = email;
  await updateDoc(doc(db, 'diagramFolders', folderId), folderUpdate);
  await Promise.all(diagramIds.map(diagramId => {
    const diagramUpdate: Record<string, unknown> = role === 'editor'
      ? { memberIds: arrayUnion(uid) }
      : { viewerIds: arrayUnion(uid) };
    if (email) diagramUpdate[`memberEmails.${uid}`] = email;
    return updateDoc(doc(db, 'diagrams', diagramId), diagramUpdate).catch(() => {});
  }));
}

export async function setFolderMemberRole(
  folder: DiagramFolder,
  uid: string,
  newRole: 'editor' | 'viewer',
): Promise<void> {
  const editorIds = folder.editorIds ?? [];
  const folderUpdate: Record<string, unknown> = {};
  if (newRole === 'editor' && !editorIds.includes(uid)) {
    folderUpdate.editorIds = arrayUnion(uid);
  } else if (newRole === 'viewer' && editorIds.includes(uid)) {
    folderUpdate.editorIds = arrayRemove(uid);
  }
  if (Object.keys(folderUpdate).length > 0) {
    await updateDoc(doc(db, 'diagramFolders', folder.id), folderUpdate);
  }
  await Promise.all(folder.diagramIds.map(async diagramId => {
    const diagramUpdate: Record<string, unknown> = newRole === 'editor'
      ? { memberIds: arrayUnion(uid), viewerIds: arrayRemove(uid) }
      : { viewerIds: arrayUnion(uid), memberIds: arrayRemove(uid) };
    return updateDoc(doc(db, 'diagrams', diagramId), diagramUpdate).catch(() => {});
  }));
}

export async function removeFolderMember(folder: DiagramFolder, uid: string): Promise<void> {
  const emails = { ...(folder.memberEmails ?? {}) };
  delete emails[uid];
  await updateDoc(doc(db, 'diagramFolders', folder.id), {
    memberIds: arrayRemove(uid),
    editorIds: arrayRemove(uid),
    memberEmails: emails,
  });
  await Promise.all(folder.diagramIds.map(diagramId =>
    updateDoc(doc(db, 'diagrams', diagramId), {
      memberIds: arrayRemove(uid),
      viewerIds: arrayRemove(uid),
    }).catch(() => {}),
  ));
}

export async function generateEditorInvite(folder: DiagramFolder): Promise<string> {
  const token = crypto.randomUUID();
  await Promise.all([
    updateDoc(doc(db, 'diagramFolders', folder.id), { editorInviteToken: token }),
    setDoc(doc(db, 'diagramFolderInvites', token), {
      folderId: folder.id,
      folderName: folder.name,
      ownerEmail: folder.ownerEmail ?? '',
      diagramIds: folder.diagramIds,
      role: 'editor',
    }),
  ]);
  return token;
}

// ── Templates ────────────────────────────────────────────────────────────────
// A template is a regular `diagrams` doc with isTemplate:true — this reuses
// every existing subscribe/read function and rule for the full page/shape/
// connector/variable tree, so opening a template to author/tweak it just
// works with the existing editor, zero new code there.

async function cloneDiagramContent(
  sourceDiagramId: string,
  newOwnerId: string,
  newOwnerEmail: string | undefined,
  overrides: { name: string; isTemplate?: boolean; templateCategory?: string; templateDescription?: string; templateIsBuiltIn?: boolean },
): Promise<DiagramDocument> {
  const sourcePagesSnap = await getDocs(collection(db, 'diagrams', sourceDiagramId, 'pages'));
  const sourcePages = sourcePagesSnap.docs.map(d => ({ id: d.id, ...d.data() } as DiagramPage));
  const pageIdMap = new Map<string, string>();
  for (const p of sourcePages) pageIdMap.set(p.id, crypto.randomUUID());

  // Every shape/connector across all pages is gathered — and every shape's
  // fresh id assigned — before any cross-reference gets remapped below, since
  // a link or dataBinding on page 1 can point at a shape/variable on page 5.
  const shapesByPage = new Map<string, DiagramNode[]>();
  const connectorsByPage = new Map<string, DiagramEdge[]>();
  const shapeIdMap = new Map<string, string>();
  for (const p of sourcePages) {
    const shapesSnap = await getDocs(collection(db, 'diagrams', sourceDiagramId, 'pages', p.id, 'shapes'));
    const shapes = shapesSnap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as DiagramNode));
    shapesByPage.set(p.id, shapes);
    for (const s of shapes) shapeIdMap.set(s.id, crypto.randomUUID());

    const connectorsSnap = await getDocs(collection(db, 'diagrams', sourceDiagramId, 'pages', p.id, 'connectors'));
    connectorsByPage.set(p.id, connectorsSnap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as DiagramEdge)));
  }

  const variablesSnap = await getDocs(collection(db, 'diagrams', sourceDiagramId, 'variables'));
  const sourceVariables = variablesSnap.docs.map(d => ({ id: d.id, ...d.data() } as DiagramVariable));
  const variableIdMap = new Map<string, string>();
  for (const v of sourceVariables) variableIdMap.set(v.id, crypto.randomUUID());

  const newDiagramId = crypto.randomUUID();
  const newInviteToken = crypto.randomUUID();
  const newDiagram: DiagramDocument = {
    id: newDiagramId,
    name: overrides.name,
    ownerId: newOwnerId,
    ownerEmail: newOwnerEmail ?? '',
    coOwnerIds: [],
    memberIds: [],
    memberEmails: {},
    viewerIds: [],
    inviteToken: newInviteToken,
    pageOrder: sourcePages.map(p => pageIdMap.get(p.id)!),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isTemplate: overrides.isTemplate,
    templateCategory: overrides.templateCategory,
    templateDescription: overrides.templateDescription,
    templateIsBuiltIn: overrides.templateIsBuiltIn,
  };

  // The parent diagram doc must exist BEFORE any subcollection write commits —
  // every pages/shapes/connectors rule resolves access via get() on this
  // parent doc, and get() inside a security rule does not see other writes
  // still pending in the same batch. Writing it here, awaited on its own
  // (mirrors handleGroup's identical parent-before-children ordering in
  // Canvas.tsx), guarantees it's already committed by the time the chunked
  // batches below run.
  await Promise.all([
    setDoc(doc(db, 'diagrams', newDiagramId), newDiagram),
    setDoc(doc(db, 'diagramInvites', newInviteToken), { diagramId: newDiagramId, diagramName: overrides.name, ownerId: newOwnerId }),
  ]);

  const writes: { ref: ReturnType<typeof doc>; data: object }[] = [];

  for (const p of sourcePages) {
    const newPageId = pageIdMap.get(p.id)!;
    writes.push({ ref: doc(db, 'diagrams', newDiagramId, 'pages', newPageId), data: { ...p, id: newPageId } });

    for (const s of shapesByPage.get(p.id) ?? []) {
      const newShapeId = shapeIdMap.get(s.id)!;
      const newParentId = s.parentId ? shapeIdMap.get(s.parentId) : undefined;
      const data = { ...(s.data as ShapeNodeData), pageId: newPageId };
      if (data.dataBinding) {
        const newVarId = variableIdMap.get(data.dataBinding.variableId);
        data.dataBinding = newVarId ? { ...data.dataBinding, variableId: newVarId } : undefined;
      }
      if (data.link) {
        const newTargetPageId = data.link.targetPageId ? pageIdMap.get(data.link.targetPageId) : undefined;
        const newTargetNodeId = data.link.targetNodeId ? shapeIdMap.get(data.link.targetNodeId) : undefined;
        data.link = data.link.type === 'url'
          ? data.link
          : (newTargetPageId || newTargetNodeId) ? { ...data.link, targetPageId: newTargetPageId, targetNodeId: newTargetNodeId } : undefined;
      }
      writes.push({
        ref: doc(db, 'diagrams', newDiagramId, 'pages', newPageId, 'shapes', newShapeId),
        data: { ...s, id: newShapeId, parentId: newParentId, data },
      });
    }

    for (const e of connectorsByPage.get(p.id) ?? []) {
      const newSource = shapeIdMap.get(e.source);
      const newTarget = shapeIdMap.get(e.target);
      if (!newSource || !newTarget) continue; // dangling reference — don't carry a broken edge forward
      const newEdgeId = crypto.randomUUID();
      writes.push({
        ref: doc(db, 'diagrams', newDiagramId, 'pages', newPageId, 'connectors', newEdgeId),
        data: { ...e, id: newEdgeId, source: newSource, target: newTarget },
      });
    }
  }

  for (const v of sourceVariables) {
    const newVarId = variableIdMap.get(v.id)!;
    writes.push({ ref: doc(db, 'diagrams', newDiagramId, 'variables', newVarId), data: { ...v, id: newVarId } });
  }

  // Firestore caps a single batch at 500 writes; a template's shape count is
  // unbounded, so commit in safely-sized chunks instead of one batch.
  const CHUNK = 400;
  for (let i = 0; i < writes.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const w of writes.slice(i, i + CHUNK)) batch.set(w.ref, w.data);
    await batch.commit();
  }

  return newDiagram;
}

// ── Version history ──────────────────────────────────────────────────────────
// An explicit, user-triggered snapshot of a diagram's entire live content
// (every page, its shapes/connectors, and the document's variables) stored as
// one flattened doc — not a continuous/automatic history, since this repo has
// no Cloud Functions to drive that server-side. Distinct from undo/redo
// (which is a per-tab, in-memory-only command stack): a version survives a
// reload and can be restored by anyone with access to the diagram.
const MAX_VERSIONS = 20;

export interface DiagramVersion {
  id: string;
  createdAt: number;
  createdBy: string;
  name?: string;
  pageOrder: string[];
  pages: DiagramPage[];
  shapesByPage: Record<string, DiagramNode[]>;
  connectorsByPage: Record<string, DiagramEdge[]>;
  variables: DiagramVariable[];
}

export function subscribeVersions(diagramId: string, onChange: (versions: DiagramVersion[]) => void): () => void {
  const col = collection(db, 'diagrams', diagramId, 'versions');
  return onSnapshot(col, snap => {
    const versions = snap.docs.map(d => ({ id: d.id, ...d.data() } as DiagramVersion));
    versions.sort((a, b) => b.createdAt - a.createdAt);
    onChange(versions);
  });
}

export async function saveVersion(diagramId: string, uid: string, name?: string): Promise<void> {
  const pagesSnap = await getDocs(collection(db, 'diagrams', diagramId, 'pages'));
  const pages = pagesSnap.docs.map(d => ({ id: d.id, ...d.data() } as DiagramPage));

  const shapesByPage: Record<string, DiagramNode[]> = {};
  const connectorsByPage: Record<string, DiagramEdge[]> = {};
  for (const p of pages) {
    const shapesSnap = await getDocs(collection(db, 'diagrams', diagramId, 'pages', p.id, 'shapes'));
    shapesByPage[p.id] = shapesSnap.docs.map(d => d.data() as DiagramNode);
    const connectorsSnap = await getDocs(collection(db, 'diagrams', diagramId, 'pages', p.id, 'connectors'));
    connectorsByPage[p.id] = connectorsSnap.docs.map(d => d.data() as DiagramEdge);
  }

  const variablesSnap = await getDocs(collection(db, 'diagrams', diagramId, 'variables'));
  const variables = variablesSnap.docs.map(d => d.data() as DiagramVariable);

  const diagramSnap = await getDoc(doc(db, 'diagrams', diagramId));
  const pageOrder = (diagramSnap.data() as DiagramDocument | undefined)?.pageOrder ?? pages.map(p => p.id);

  const versionId = crypto.randomUUID();
  const version: DiagramVersion = {
    id: versionId, createdAt: Date.now(), createdBy: uid, name,
    pageOrder, pages, shapesByPage, connectorsByPage, variables,
  };
  await setDoc(doc(db, 'diagrams', diagramId, 'versions', versionId), version);

  // Cap history at MAX_VERSIONS, dropping the oldest beyond that.
  const existingSnap = await getDocs(collection(db, 'diagrams', diagramId, 'versions'));
  const existing = existingSnap.docs.map(d => ({ id: d.id, ...d.data() } as DiagramVersion));
  existing.sort((a, b) => b.createdAt - a.createdAt);
  const toDelete = existing.slice(MAX_VERSIONS);
  await Promise.all(toDelete.map(v => deleteDoc(doc(db, 'diagrams', diagramId, 'versions', v.id))));
}

export async function deleteVersion(diagramId: string, versionId: string): Promise<void> {
  await deleteDoc(doc(db, 'diagrams', diagramId, 'versions', versionId));
}

// Reverts the whole document to exactly how it looked when `version` was
// saved: deletes any page/shape/connector/variable created since, and
// overwrites everything the version captured back into place. Not a merge or
// a diff view — a full-document rollback, same scope boundary as the rest of
// this pass's version history feature.
export async function restoreVersion(diagramId: string, version: DiagramVersion): Promise<void> {
  const livePagesSnap = await getDocs(collection(db, 'diagrams', diagramId, 'pages'));
  const versionPageIds = new Set(version.pages.map(p => p.id));

  const deletes: ReturnType<typeof doc>[] = [];
  const sets: { ref: ReturnType<typeof doc>; data: object }[] = [];

  for (const livePage of livePagesSnap.docs) {
    const livePageId = livePage.id;
    const liveShapesSnap = await getDocs(collection(db, 'diagrams', diagramId, 'pages', livePageId, 'shapes'));
    const liveConnectorsSnap = await getDocs(collection(db, 'diagrams', diagramId, 'pages', livePageId, 'connectors'));

    if (!versionPageIds.has(livePageId)) {
      // This page didn't exist when the version was saved — remove it and
      // everything on it entirely, rather than trying to reconcile it below.
      deletes.push(doc(db, 'diagrams', diagramId, 'pages', livePageId));
      for (const s of liveShapesSnap.docs) deletes.push(doc(db, 'diagrams', diagramId, 'pages', livePageId, 'shapes', s.id));
      for (const e of liveConnectorsSnap.docs) deletes.push(doc(db, 'diagrams', diagramId, 'pages', livePageId, 'connectors', e.id));
      continue;
    }

    const versionShapeIds = new Set((version.shapesByPage[livePageId] ?? []).map(s => s.id));
    const versionConnectorIds = new Set((version.connectorsByPage[livePageId] ?? []).map(e => e.id));
    for (const s of liveShapesSnap.docs) {
      if (!versionShapeIds.has(s.id)) deletes.push(doc(db, 'diagrams', diagramId, 'pages', livePageId, 'shapes', s.id));
    }
    for (const e of liveConnectorsSnap.docs) {
      if (!versionConnectorIds.has(e.id)) deletes.push(doc(db, 'diagrams', diagramId, 'pages', livePageId, 'connectors', e.id));
    }
  }

  const liveVariablesSnap = await getDocs(collection(db, 'diagrams', diagramId, 'variables'));
  const versionVariableIds = new Set(version.variables.map(v => v.id));
  for (const v of liveVariablesSnap.docs) {
    if (!versionVariableIds.has(v.id)) deletes.push(doc(db, 'diagrams', diagramId, 'variables', v.id));
  }

  for (const p of version.pages) {
    sets.push({ ref: doc(db, 'diagrams', diagramId, 'pages', p.id), data: p });
  }
  for (const [pageId, shapes] of Object.entries(version.shapesByPage)) {
    for (const s of shapes) sets.push({ ref: doc(db, 'diagrams', diagramId, 'pages', pageId, 'shapes', s.id), data: s });
  }
  for (const [pageId, edges] of Object.entries(version.connectorsByPage)) {
    for (const e of edges) sets.push({ ref: doc(db, 'diagrams', diagramId, 'pages', pageId, 'connectors', e.id), data: e });
  }
  for (const v of version.variables) {
    sets.push({ ref: doc(db, 'diagrams', diagramId, 'variables', v.id), data: v });
  }

  // Firestore caps a single batch at 500 writes; chunk both deletes and sets
  // (never mixed on the same doc, so ordering between them doesn't matter).
  const CHUNK = 400;
  const allOps: Array<{ delete: true; ref: ReturnType<typeof doc> } | { delete: false; ref: ReturnType<typeof doc>; data: object }> = [
    ...deletes.map(ref => ({ delete: true as const, ref })),
    ...sets.map(s => ({ delete: false as const, ref: s.ref, data: s.data })),
  ];
  for (let i = 0; i < allOps.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const op of allOps.slice(i, i + CHUNK)) {
      if (op.delete) batch.delete(op.ref); else batch.set(op.ref, op.data);
    }
    await batch.commit();
  }

  // pageOrder + updatedAt land last, once every page/shape/connector/variable
  // write above has committed.
  await updateDoc(doc(db, 'diagrams', diagramId), { pageOrder: version.pageOrder, updatedAt: Date.now() });
}

export async function saveDiagramAsTemplate(diagram: DiagramDocument, category?: string, description?: string): Promise<DiagramDocument> {
  const newDiagram = await cloneDiagramContent(diagram.id, diagram.ownerId, diagram.ownerEmail, {
    name: diagram.name, isTemplate: true, templateCategory: category, templateDescription: description, templateIsBuiltIn: false,
  });

  // Best-effort thumbnail: "Save as template" is triggered from the
  // Dashboard, where the source diagram isn't open/rendered anywhere, so
  // there's no live DOM to screenshot (unlike PNG/PDF/PPTX export, which
  // capture the currently-open Canvas). Read the source's first page +
  // shapes instead (the clone just copied identical content) and render a
  // rough SVG mini-preview — captured once here, since a template's
  // content never changes after creation.
  try {
    const firstPageId = diagram.pageOrder[0];
    if (firstPageId) {
      const pageSnap = await getDoc(doc(db, 'diagrams', diagram.id, 'pages', firstPageId));
      const page = pageSnap.data() as DiagramPage | undefined;
      if (page) {
        const shapesSnap = await getDocs(collection(db, 'diagrams', diagram.id, 'pages', firstPageId, 'shapes'));
        const shapes = shapesSnap.docs.map(d => d.data() as DiagramNode);
        const dims = getPageDimensions(page.paperSize, page.orientation, page.customWidth, page.customHeight);
        const templateThumbnailUrl = buildTemplateThumbnailSvgDataUrl(shapes, dims);
        await updateDoc(doc(db, 'diagrams', newDiagram.id), { templateThumbnailUrl });
        newDiagram.templateThumbnailUrl = templateThumbnailUrl;
      }
    }
  } catch {
    // A thumbnail is a nice-to-have — the template itself already saved fine.
  }

  return newDiagram;
}

export async function createDiagramFromTemplate(templateDiagramId: string, newName: string, uid: string, email?: string): Promise<DiagramDocument> {
  return cloneDiagramContent(templateDiagramId, uid, email, { name: newName, isTemplate: false });
}

export function subscribeBuiltInTemplates(onChange: (templates: DiagramDocument[]) => void): () => void {
  const col = collection(db, 'diagrams');
  return onSnapshot(query(col, where('isTemplate', '==', true), where('templateIsBuiltIn', '==', true)), snap => {
    onChange(snap.docs.map(d => ({ id: d.id, ...d.data() } as DiagramDocument)));
  }, () => {});
}

export function subscribeMyTemplates(uid: string, onChange: (templates: DiagramDocument[]) => void): () => void {
  const col = collection(db, 'diagrams');
  return onSnapshot(query(col, where('isTemplate', '==', true), where('ownerId', '==', uid)), snap => {
    onChange(snap.docs.map(d => ({ id: d.id, ...d.data() } as DiagramDocument)));
  }, () => {});
}
