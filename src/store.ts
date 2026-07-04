import {
  doc, getDoc, setDoc, deleteDoc, collection,
  query, where, getDocs, updateDoc, onSnapshot, writeBatch, serverTimestamp, arrayUnion,
} from 'firebase/firestore';
import { db } from './firebase';
import type { DiagramDocument, DiagramPage, PresentationSettings } from './types/document';
import type { DiagramNode } from './types/shapes';
import type { DiagramEdge } from './types/edges';
import type { DiagramVariable } from './types/variables';
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
