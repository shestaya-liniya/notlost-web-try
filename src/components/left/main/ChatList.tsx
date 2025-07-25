import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useEffect, useMemo, useRef, useState,
} from '../../../lib/teact/teact';
import { getActions } from '../../../global';

import type { ApiSession } from '../../../api/types';
import type { GlobalState } from '../../../global/types';
import type { FolderEditDispatch } from '../../../hooks/reducers/useFoldersReducer';
import { LeftColumnContent } from '../../../types';

import {
  ALL_FOLDER_ID,
  ARCHIVE_MINIMIZED_HEIGHT,
  ARCHIVED_FOLDER_ID,
  CHAT_HEIGHT_PX,
  CHAT_LIST_SLICE,
  FRESH_AUTH_PERIOD,
  SAVED_FOLDER_ID,
} from '../../../config';
import { IS_APP, IS_MAC_OS } from '../../../util/browser/windowEnvironment';
import buildClassName from '../../../util/buildClassName';
import {
  getAllBotsIds, getAllChannelsIds, getAllGroupsIds, getOrderKey, getPinnedChatsCount, getUnreadChatsByFolderId,
} from '../../../util/folderManager';
import { getServerTime } from '../../../util/serverTime';

import usePeerStoriesPolling from '../../../hooks/polling/usePeerStoriesPolling';
import useTopOverscroll from '../../../hooks/scroll/useTopOverscroll';
import useDebouncedCallback from '../../../hooks/useDebouncedCallback';
import { useFolderManagerForOrderedIds } from '../../../hooks/useFolderManager';
import { useHotkeys } from '../../../hooks/useHotkeys';
import useInfiniteScroll from '../../../hooks/useInfiniteScroll';
import { useIntersectionObserver } from '../../../hooks/useIntersectionObserver';
import useLastCallback from '../../../hooks/useLastCallback';
import useOrderDiff from './hooks/useOrderDiff';

import InfiniteScroll from '../../ui/InfiniteScroll';
import Loading from '../../ui/Loading';
import Archive from './Archive';
import Chat from './Chat';
import EmptyFolder from './EmptyFolder';
import FrozenAccountNotification from './FrozenAccountNotification';
import UnconfirmedSession from './UnconfirmedSession';

type OwnProps = {
  className?: string;
  folderType: 'all' | 'archived' | 'saved' | 'folder';
  folderId?: number;
  category?: 'unread' | 'groups' | 'channels' | 'bots';
  isActive: boolean;
  canDisplayArchive?: boolean;
  archiveSettings?: GlobalState['archiveSettings'];
  isForumPanelOpen?: boolean;
  sessions?: Record<string, ApiSession>;
  isAccountFrozen?: boolean;
  isMainList?: boolean;
  foldersDispatch?: FolderEditDispatch;
};

const INTERSECTION_THROTTLE = 200;
const DRAG_ENTER_DEBOUNCE = 500;
const RESERVED_HOTKEYS = new Set(['9', '0']);

const ChatList: FC<OwnProps> = ({
  className,
  folderType,
  folderId,
  category,
  isActive,
  isForumPanelOpen,
  /* canDisplayArchive, */
  archiveSettings,
  sessions,
  isAccountFrozen,
  isMainList,
  foldersDispatch,
}) => {
  const {
    openChat,
    openNextChat,
    closeForumPanel,
    toggleStoryRibbon,
    openFrozenAccountModal,
    openLeftColumnContent,
  } = getActions();
  // eslint-disable-next-line no-null/no-null
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldIgnoreDragRef = useRef(false);
  const [unconfirmedSessionHeight, setUnconfirmedSessionHeight] = useState(0);

  const isArchived = folderType === 'archived';
  const isAllFolder = folderType === 'all';
  const isSaved = folderType === 'saved';
  const resolvedFolderId = (
    isAllFolder ? ALL_FOLDER_ID : isArchived ? ARCHIVED_FOLDER_ID : isSaved ? SAVED_FOLDER_ID : folderId!
  );

  const shouldDisplayArchive = false; /* isAllFolder && canDisplayArchive && archiveSettings; */
  const shouldShowFrozenAccountNotification = isAccountFrozen && isAllFolder;

  const folderOrderedIds = useFolderManagerForOrderedIds(resolvedFolderId);

  const allUnreadIds = getUnreadChatsByFolderId()[ALL_FOLDER_ID];
  const allBotIds = getAllBotsIds();
  const allGroupsIds = getAllGroupsIds();
  const allChannelsIds = getAllChannelsIds();

  const orderedIds = useMemo(() => {
    switch (category) {
      case 'unread':
        return allUnreadIds;
      case 'bots':
        return allBotIds;
      case 'groups':
        return allGroupsIds;
      case 'channels':
        return allChannelsIds;
      default:
        return folderOrderedIds;
    }
  }, [category, allUnreadIds, allBotIds, allGroupsIds, allChannelsIds, folderOrderedIds]);

  usePeerStoriesPolling(orderedIds);

  const chatsHeight = (orderedIds?.length || 0) * CHAT_HEIGHT_PX;
  const archiveHeight = shouldDisplayArchive
    ? archiveSettings?.isMinimized ? ARCHIVE_MINIMIZED_HEIGHT : CHAT_HEIGHT_PX : 0;
  const frozenNotificationHeight = shouldShowFrozenAccountNotification ? 68 : 0;

  const { orderDiffById, getAnimationType } = useOrderDiff(orderedIds);

  const [viewportIds, getMore] = useInfiniteScroll(undefined, orderedIds, undefined, CHAT_LIST_SLICE);

  const shouldShowUnconfirmedSessions = useMemo(() => {
    const sessionsArray = Object.values(sessions || {});
    const current = sessionsArray.find((session) => session.isCurrent);
    if (!current || getServerTime() - current.dateCreated < FRESH_AUTH_PERIOD) return false;

    return !isAccountFrozen && isAllFolder && sessionsArray.some((session) => session.isUnconfirmed);
  }, [isAllFolder, sessions, isAccountFrozen]);

  useEffect(() => {
    if (!shouldShowUnconfirmedSessions) setUnconfirmedSessionHeight(0);
  }, [shouldShowUnconfirmedSessions]);

  // Support <Alt>+<Up/Down> to navigate between chats
  useHotkeys(useMemo(() => (isActive && orderedIds?.length ? {
    'Alt+ArrowUp': (e: KeyboardEvent) => {
      e.preventDefault();
      openNextChat({ targetIndexDelta: -1, orderedIds });
    },
    'Alt+ArrowDown': (e: KeyboardEvent) => {
      e.preventDefault();
      openNextChat({ targetIndexDelta: 1, orderedIds });
    },
  } : undefined), [isActive, orderedIds]));

  // Support <Cmd>+<Digit> to navigate between chats
  useEffect(() => {
    if (!isActive || isSaved || !orderedIds || !IS_APP) {
      return undefined;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (((IS_MAC_OS && e.metaKey) || (!IS_MAC_OS && e.ctrlKey)) && e.code.startsWith('Digit')) {
        const [, digit] = e.code.match(/Digit(\d)/) || [];
        if (!digit || RESERVED_HOTKEYS.has(digit)) return;

        const isArchiveInList = shouldDisplayArchive && archiveSettings && !archiveSettings.isMinimized;

        const shift = isArchiveInList ? -1 : 0;
        const position = Number(digit) + shift - 1;

        if (isArchiveInList && position === -1) {
          if (isMainList) openLeftColumnContent({ contentKey: LeftColumnContent.Archived });
          return;
        }

        if (position > orderedIds!.length - 1) return;

        openChat({ id: orderedIds![position], shouldReplaceHistory: true });
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    archiveSettings, isSaved, isActive, openChat, openNextChat, orderedIds, shouldDisplayArchive, isMainList,
  ]);

  const { observe } = useIntersectionObserver({
    rootRef: containerRef,
    throttleMs: INTERSECTION_THROTTLE,
  });

  const handleArchivedClick = useLastCallback(() => {
    openLeftColumnContent({ contentKey: LeftColumnContent.Archived });
    closeForumPanel();
  });

  const handleFrozenAccountNotificationClick = useLastCallback(() => {
    openFrozenAccountModal();
  });

  const handleArchivedDragEnter = useLastCallback(() => {
    if (shouldIgnoreDragRef.current) {
      shouldIgnoreDragRef.current = false;
      return;
    }
    handleArchivedClick();
  });

  const handleDragEnter = useDebouncedCallback((chatId: string) => {
    if (shouldIgnoreDragRef.current) {
      shouldIgnoreDragRef.current = false;
      return;
    }
    openChat({ id: chatId, shouldReplaceHistory: true });
  }, [openChat], DRAG_ENTER_DEBOUNCE, true);

  const handleDragLeave = useLastCallback((e: React.DragEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < rect.width || y < rect.y) return;
    shouldIgnoreDragRef.current = true;
  });

  const handleShowStoryRibbon = useLastCallback(() => {
    toggleStoryRibbon({ isShown: true, isArchived });
  });

  const handleHideStoryRibbon = useLastCallback(() => {
    toggleStoryRibbon({ isShown: false, isArchived });
  });

  const renderedOverflowTrigger = useTopOverscroll(containerRef, handleShowStoryRibbon, handleHideStoryRibbon, isSaved);

  function renderChats() {
    const viewportOffset = orderedIds!.indexOf(viewportIds![0]);

    const pinnedCount = getPinnedChatsCount(resolvedFolderId) || 0;

    return viewportIds!.map((id, i) => {
      const isPinned = viewportOffset + i < pinnedCount;
      const offsetTop = unconfirmedSessionHeight + archiveHeight + frozenNotificationHeight
      + (viewportOffset + i) * CHAT_HEIGHT_PX;

      return (
        <Chat
          key={id}
          teactOrderKey={isPinned ? i : getOrderKey(id, isSaved)}
          chatId={id}
          isPinned={isPinned}
          folderId={folderId}
          isSavedDialog={isSaved}
          animationType={getAnimationType(id)}
          orderDiff={orderDiffById[id]}
          offsetTop={offsetTop}
          observeIntersection={observe}
          onDragEnter={handleDragEnter}
          withSubtitle
        />
      );
    });
  }

  return (
    <InfiniteScroll
      className={buildClassName('chat-list custom-scroll', isForumPanelOpen && 'forum-panel-open', className)}
      ref={containerRef}
      items={viewportIds}
      itemSelector=".ListItem:not(.chat-item-archive)"
      preloadBackwards={CHAT_LIST_SLICE}
      withAbsolutePositioning
      beforeChildren={renderedOverflowTrigger}
      maxHeight={chatsHeight + archiveHeight + frozenNotificationHeight + unconfirmedSessionHeight}
      onLoadMore={getMore}
      onDragLeave={handleDragLeave}
    >
      {shouldShowUnconfirmedSessions && (
        <UnconfirmedSession
          key="unconfirmed"
          sessions={sessions!}
          onHeightChange={setUnconfirmedSessionHeight}
        />
      )}
      {shouldShowFrozenAccountNotification && (
        <FrozenAccountNotification
          key="frozen"
          onClick={handleFrozenAccountNotificationClick}
        />
      )}
      {shouldDisplayArchive && (
        <Archive
          key="archive"
          archiveSettings={archiveSettings!} // archiveSettings
          onClick={handleArchivedClick}
          onDragEnter={handleArchivedDragEnter}
        />
      )}
      {viewportIds?.length ? (
        renderChats()
      ) : viewportIds && !viewportIds.length && !isSaved ? (
        (
          <EmptyFolder
            folderId={folderId}
            folderType={folderType}
            foldersDispatch={foldersDispatch!}
          />
        )
      ) : (
        <Loading key="loading" />
      )}
    </InfiniteScroll>
  );
};

export default memo(ChatList);
