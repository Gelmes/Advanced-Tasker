import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './useStore';

// Exercises the undo/redo history on the real store (structural + content edits).

const get = () => useStore.getState();
const firstChild = () => get().project.root.children[0];

beforeEach(() => {
  get().newProject(); // empty project, history reset
});

describe('undo / redo', () => {
  it('undoes and redoes node creation', () => {
    get().newSibling();
    expect(get().project.root.children).toHaveLength(1);

    get().undo();
    expect(get().project.root.children).toHaveLength(0);

    get().redo();
    expect(get().project.root.children).toHaveLength(1);
  });

  it('undoes a content edit back to the empty string', () => {
    get().newSibling();
    const id = get().selectedId!;
    get().setNodeContent(id, 'hello');
    expect(firstChild().content).toBe('hello');

    get().undo();
    expect(firstChild().content).toBe('');
  });

  it('clears the redo stack once a new edit is made', () => {
    get().newSibling();
    get().undo(); // can now redo
    expect(get().future.length).toBe(1);

    get().newSibling(); // a fresh edit invalidates redo
    expect(get().future.length).toBe(0);
  });

  it('does nothing when there is no history', () => {
    expect(get().past.length).toBe(0);
    get().undo();
    expect(get().project.root.children).toHaveLength(0);
  });
});

describe('copy / cut / paste', () => {
  it('pastes a copy as a sibling below the selection with fresh ids', () => {
    get().newSibling();
    const a = get().selectedId!;
    get().setNodeContent(a, 'A');
    get().copySelected();
    get().pasteAfterSelected();

    const roots = get().project.root.children;
    expect(roots).toHaveLength(2);
    expect(roots[1].content).toBe('A');
    expect(roots[1].id).not.toBe(a); // new id
    expect(get().selectedId).toBe(roots[1].id); // selection follows the paste
  });

  it('a copy resets tracked time and lifecycle history', () => {
    get().newSibling();
    const a = get().selectedId!;
    get().setStatusFor(a, 'done');
    get().toggleTimerFor(a); // accrue some state
    get().copySelected();
    get().pasteAfterSelected();

    const pasted = get().project.root.children[1];
    expect(pasted.time.intervals).toEqual([]);
    expect(pasted.time.startedAt).toBeNull();
    expect(pasted.statusHistory).toHaveLength(1); // reseeded at paste, not inherited
  });

  it('cut removes the node and paste re-inserts it', () => {
    get().newSibling();
    const a = get().selectedId!;
    get().setNodeContent(a, 'movable');
    get().cutSelected();
    expect(get().project.root.children).toHaveLength(0);

    get().pasteAfterSelected();
    expect(get().project.root.children).toHaveLength(1);
    expect(get().project.root.children[0].content).toBe('movable');
  });
});

describe('status history capture', () => {
  it('coalesces rapid status changes into the landed value', () => {
    get().newSibling();
    const id = get().selectedId!;
    // Rapid cycling within the settle window (tests run fast).
    get().setStatusFor(id, 'doing');
    get().setStatusFor(id, 'blocked');
    get().setStatusFor(id, 'done');

    const hist = firstChild().statusHistory;
    expect(hist).toHaveLength(1);
    expect(hist[0].status).toBe('done');
  });

  it('records nothing when a burst lands back on the starting status', () => {
    get().newSibling();
    const id = get().selectedId!;
    // null (note) -> doing -> ... -> back to null
    get().setStatusFor(id, 'doing');
    get().setStatusFor(id, 'blocked');
    get().setStatusFor(id, null);

    expect(firstChild().statusHistory).toHaveLength(0);
    expect(firstChild().status).toBeNull();
  });
});
