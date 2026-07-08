import {
  doc, getDoc, setDoc, deleteDoc, collection,
  query, where, getDocs, updateDoc, onSnapshot, writeBatch, serverTimestamp, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { db } from './firebase';
import type { DiagramDocument, DiagramPage, PresentationSettings, DiagramFolder, DiagramFolderInviteInfo, FolderRole } from './types/document';
import type { DiagramNode, ShapeNodeData } from './types/shapes';
import type { DiagramEdge } from './types/edges';
import type { DiagramVariable } from './types/variables';
import type { DiagramComment } from './types/comments';
import { getPageDimensions } from './utils/paperSizes';
import { DEFAULT_ORIENTATION, DEFAULT_PAPER_SIZE } from './constants';

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isDiagramOwner(diagram: DiagramDocument, uid: string): boolean {
  return diagram.ownerId === uid || (diagram.coOwnerIds ?? []).includes(uid);
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

export async function updatePresentationSettings(diagramId: string, patch: Partial<PresentationSettings>): Promise<void> {
  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  for (const [key, value] of Object.entries(patch)) updates[`presentationSettings.${key}`] = value;
  await updateDoc(doc(db, 'diagrams', diagramId), updates);
}

export function subscribeDiagram(diagramId: string, onChange: (diagram: DiagramDocument | null) => void): () => void {
  return onSnapshot(doc(db, 'diagrams', diagramId), snap => {
    onChange(snap.exists() ? ({ id: snap.id, ...snap.data() } as DiagramDocument) : null);
  });
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

export async function addPage(diagramId: string, afterOrder: number, options: NewPageOptions = {}): Promise<DiagramPage> {
  const pageId = crypto.randomUUID();
  const page: DiagramPage = {
    id: pageId,
    name: options.name ?? `Page ${afterOrder + 2}`,
    order: afterOrder + 1,
    paperSize: options.paperSize ?? DEFAULT_PAPER_SIZE,
    orientation: options.orientation ?? DEFAULT_ORIENTATION,
    customWidth: options.customWidth,
    customHeight: options.customHeight,
  };
  const batch = writeBatch(db);
  batch.set(doc(db, 'diagrams', diagramId, 'pages', pageId), page);
  batch.update(doc(db, 'diagrams', diagramId), { updatedAt: Date.now() });
  await batch.commit();
  return page;
}

export async function updatePage(diagramId: string, pageId: string, patch: Partial<DiagramPage>): Promise<void> {
  await updateDoc(doc(db, 'diagrams', diagramId, 'pages', pageId), patch);
}

export async function deletePage(diagramId: string, pageId: string): Promise<void> {
  await deleteDoc(doc(db, 'diagrams', diagramId, 'pages', pageId));
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

export async function saveDiagramAsTemplate(diagram: DiagramDocument, category?: string, description?: string): Promise<DiagramDocument> {
  return cloneDiagramContent(diagram.id, diagram.ownerId, diagram.ownerEmail, {
    name: diagram.name, isTemplate: true, templateCategory: category, templateDescription: description, templateIsBuiltIn: false,
  });
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
