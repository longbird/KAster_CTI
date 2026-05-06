import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Announcement } from '../types/cti';
import { AnnouncementsPanel } from './AnnouncementsPanel';

describe('AnnouncementsPanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('pinned 공지를 업무 화면 상단 공지로 표시한다', () => {
    const announcements: Announcement[] = [
      {
        announcementId: 'notice-1',
        title: '긴급 배차 지연',
        body: '우선 안내 후 콜백 처리',
        authorName: '관리자',
        pinned: true,
        createdAt: '2026-05-05T00:00:00.000Z',
        updatedAt: '2026-05-05T00:00:00.000Z',
      },
    ];

    render(<AnnouncementsPanel announcements={announcements} />);

    expect(screen.getByText('공지사항')).toBeInTheDocument();
    expect(screen.getByText('긴급 배차 지연')).toBeInTheDocument();
    expect(screen.getByText('우선 안내 후 콜백 처리')).toBeInTheDocument();
    expect(screen.getByText('고정')).toBeInTheDocument();
  });

  it('공지 목록이 비어 있으면 화면을 차지하지 않는다', () => {
    const { container } = render(<AnnouncementsPanel announcements={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
