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
