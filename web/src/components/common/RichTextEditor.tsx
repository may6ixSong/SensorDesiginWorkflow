import { Box } from '@mui/material';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Icon } from '@/components/common/Icon';
import { CURSOR_POINTER, FONT_SANS, R, T } from '@/theme/tokens';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

/**
 * 가벼운 서식 에디터(굵게/기울임/목록/링크) — Calypso 버전 note에 쓴다(사용자 요청).
 * HTML로 저장한다 — 그래서 이걸 보여주는 쪽(ArtifactVersionContents의 note 표시)은
 * 반드시 DOMPurify로 sanitize한 뒤에만 렌더링해야 한다. 여기서 만드는 HTML 자체도
 * Tiptap의 정해진 스키마 밖으로는 못 나가지만, 그 note가 나중에 다른 경로(API 직접
 * 호출 등)로 바뀔 수도 있으니 신뢰는 항상 렌더링 쪽에서 확인한다.
 */
export function RichTextEditor({ value, onChange, placeholder, minHeight = 140 }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, blockquote: false }),
      Link.configure({ openOnClick: false, autolink: true }),
    ],
    content: value,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: {
      attributes: {
        style: `min-height:${minHeight}px`,
      },
    },
  });

  if (!editor) return null;

  const btnSx = (active: boolean) => ({
    width: 26, height: 26, borderRadius: `${R.xs}px`, border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: CURSOR_POINTER,
    background: active ? T.prSoft : 'transparent', color: active ? T.pr : T.dm,
    fontFamily: FONT_SANS, fontSize: 12.5, lineHeight: 1,
    '&:hover': { background: active ? T.prSoft : T.sf2 },
  });

  const TextBtn = ({ label, title, active, onClick }: { label: string; title: string; active?: boolean; onClick: () => void }) => (
    <Box component="button" type="button" title={title} onClick={onClick} sx={btnSx(!!active)}>
      {label}
    </Box>
  );

  return (
    <Box sx={{ border: `1px solid ${T.ln2}`, borderRadius: '7px', background: T.sf, overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '2px', padding: '5px 6px', borderBottom: `1px solid ${T.ln}`, background: T.sf2 }}>
        <TextBtn label="B" title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <Box component="span" sx={{ fontStyle: 'italic' }}>
          <TextBtn label="I" title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        </Box>
        <TextBtn label="•‑" title="Bulleted list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <TextBtn label="1." title="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <Box
          component="button"
          type="button"
          title="Link"
          onClick={() => {
            const prev = editor.getAttributes('link').href as string | undefined;
            // eslint-disable-next-line no-alert
            const url = window.prompt('URL', prev ?? 'https://');
            if (url === null) return;
            if (!url.trim()) { editor.chain().focus().unsetLink().run(); return; }
            editor.chain().focus().setLink({ href: url.trim() }).run();
          }}
          sx={btnSx(editor.isActive('link'))}
        >
          <Icon name="link" size={12} />
        </Box>
      </Box>
      <Box
        sx={{
          padding: '10px 12px', fontSize: 13, fontFamily: FONT_SANS, color: T.tx, lineHeight: 1.6,
          '& .ProseMirror': { outline: 'none' },
          '& .ProseMirror p.is-editor-empty:first-of-type::before': {
            content: 'attr(data-placeholder)', color: T.dm2, float: 'left', height: 0, pointerEvents: 'none',
          },
          '& ul, & ol': { paddingLeft: '20px', margin: '4px 0' },
          '& a': { color: T.pr },
          '& p': { margin: '0 0 6px 0' },
        }}
      >
        <EditorContent editor={editor} placeholder={placeholder} />
      </Box>
    </Box>
  );
}

/** note가 실제로 화면에 보여줄 만한 내용이 있는지 — 빈 <p></p>만 있는 경우까지 빈 것으로 친다. */
export function isRichTextEmpty(html: string): boolean {
  return !html || !html.replace(/<[^>]*>/g, '').trim();
}
