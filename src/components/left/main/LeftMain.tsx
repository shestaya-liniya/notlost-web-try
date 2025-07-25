import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useEffect, useRef, useState,
} from '../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../global';

import type { ApiWorkspace } from '../../../api/notlost/types';
import type { FolderEditDispatch } from '../../../hooks/reducers/useFoldersReducer';
import { LeftColumnContent } from '../../../types';

import { PRODUCTION_URL } from '../../../config';
import { selectActiveWorkspace } from '../../../global/selectors/workspace';
import { IS_ELECTRON, IS_TOUCH_ENV } from '../../../util/browser/windowEnvironment';
import buildClassName from '../../../util/buildClassName';

import useForumPanelRender from '../../../hooks/useForumPanelRender';
import useLastCallback from '../../../hooks/useLastCallback';
import useOldLang from '../../../hooks/useOldLang';
import useShowTransitionDeprecated from '../../../hooks/useShowTransitionDeprecated';

import Button from '../../ui/Button';
import SearchInput from '../../ui/SearchInput';
import Transition from '../../ui/Transition';
import NewChatButton from '../NewChatButton';
import LeftSearch from '../search/LeftSearch.async';
import ChatList from './ChatList';
import ContactList from './ContactList.async';
import ForumPanel from './ForumPanel';
import Workspace from './Workspace';

// import LeftMainHeader from './LeftMainHeader';
import './LeftMain.scss';

type StateProps = {
  activeWorkspace?: ApiWorkspace;
};

type OwnProps = {
  content: LeftColumnContent;
  searchQuery?: string;
  searchDate?: number;
  contactsFilter: string;
  shouldSkipTransition?: boolean;
  foldersDispatch: FolderEditDispatch;
  isAppUpdateAvailable?: boolean;
  isElectronUpdateAvailable?: boolean;
  isForumPanelOpen?: boolean;
  isClosingSearch?: boolean;
  onSearchQuery: (query: string) => void;
  onTopicSearch: NoneToVoidFunction;
  isAccountFrozen?: boolean;
  onReset: () => void;
};

const TRANSITION_RENDER_COUNT = Object.keys(LeftColumnContent).length / 2;
const BUTTON_CLOSE_DELAY_MS = 250;

let closeTimeout: number | undefined;

const LeftMain: FC<OwnProps & StateProps> = ({
  content,
  searchQuery,
  searchDate,
  /* isClosingSearch, */
  contactsFilter,
  shouldSkipTransition,
  /* foldersDispatch, */
  isAppUpdateAvailable,
  isElectronUpdateAvailable,
  isForumPanelOpen,
  /* onSearchQuery, */
  onReset,
  onTopicSearch,
  isAccountFrozen,
  activeWorkspace,
}) => {
  const { /* closeForumPanel */ openLeftColumnContent } = getActions();
  const [isNewChatButtonShown, setIsNewChatButtonShown] = useState(IS_TOUCH_ENV);
  const [isElectronAutoUpdateEnabled, setIsElectronAutoUpdateEnabled] = useState(false);

  useEffect(() => {
    window.electron?.getIsAutoUpdateEnabled().then(setIsElectronAutoUpdateEnabled);
  }, []);

  const {
    shouldRenderForumPanel, handleForumPanelAnimationEnd,
    handleForumPanelAnimationStart, /* isAnimationStarted */
  } = useForumPanelRender(isForumPanelOpen);
  const isForumPanelRendered = isForumPanelOpen && content === LeftColumnContent.ChatList;
  // const isForumPanelVisible = isForumPanelRendered && isAnimationStarted;

  const {
    shouldRender: shouldRenderUpdateButton,
    transitionClassNames: updateButtonClassNames,
  } = useShowTransitionDeprecated(isAppUpdateAvailable || isElectronUpdateAvailable);

  const isMouseInside = useRef(false);

  const handleMouseEnter = useLastCallback(() => {
    if (content !== LeftColumnContent.ChatList) {
      return;
    }
    isMouseInside.current = true;
    setIsNewChatButtonShown(true);
  });

  const handleMouseLeave = useLastCallback(() => {
    isMouseInside.current = false;

    if (closeTimeout) {
      clearTimeout(closeTimeout);
      closeTimeout = undefined;
    }

    closeTimeout = window.setTimeout(() => {
      if (!isMouseInside.current) {
        setIsNewChatButtonShown(false);
      }
    }, BUTTON_CLOSE_DELAY_MS);
  });

  /* const handleSelectSettings = useLastCallback(() => {
    openLeftColumnContent({ contentKey: LeftColumnContent.Settings });
  }); */

  const handleSelectContacts = useLastCallback(() => {
    openLeftColumnContent({ contentKey: LeftColumnContent.Contacts });
  });

  /* const handleSelectArchived = useLastCallback(() => {
    openLeftColumnContent({ contentKey: LeftColumnContent.Archived });
    closeForumPanel();
  }); */

  const handleUpdateClick = useLastCallback(() => {
    if (IS_ELECTRON && !isElectronAutoUpdateEnabled) {
      window.open(`${PRODUCTION_URL}/get`, '_blank', 'noopener');
    } else if (isElectronUpdateAvailable) {
      window.electron?.installUpdate();
    } else {
      window.location.reload();
    }
  });

  const handleSelectNewChannel = useLastCallback(() => {
    openLeftColumnContent({ contentKey: LeftColumnContent.NewChannelStep1 });
  });

  const handleSelectNewGroup = useLastCallback(() => {
    openLeftColumnContent({ contentKey: LeftColumnContent.NewGroupStep1 });
  });

  useEffect(() => {
    let autoCloseTimeout: number | undefined;
    if (content !== LeftColumnContent.ChatList) {
      autoCloseTimeout = window.setTimeout(() => {
        setIsNewChatButtonShown(false);
      }, BUTTON_CLOSE_DELAY_MS);
    } else if (isMouseInside.current || IS_TOUCH_ENV) {
      setIsNewChatButtonShown(true);
    }

    return () => {
      if (autoCloseTimeout) {
        clearTimeout(autoCloseTimeout);
        autoCloseTimeout = undefined;
      }
    };
  }, [content]);

  const lang = useOldLang();

  return (
    <div
      id="LeftColumn-main"
      onMouseEnter={!IS_TOUCH_ENV ? handleMouseEnter : undefined}
      onMouseLeave={!IS_TOUCH_ENV ? handleMouseLeave : undefined}
    >
      {/* <LeftMainHeader
        shouldHideSearch={isForumPanelVisible}
        content={content}
        contactsFilter={contactsFilter}
        onSearchQuery={onSearchQuery}
        onSelectSettings={handleSelectSettings}
        onSelectContacts={handleSelectContacts}
        onSelectArchived={handleSelectArchived}
        onReset={onReset}
        shouldSkipTransition={shouldSkipTransition}
        isClosingSearch={isClosingSearch}
      /> */}
      <Transition
        name={shouldSkipTransition ? 'none' : 'none'}
        renderCount={TRANSITION_RENDER_COUNT}
        activeKey={content}
        shouldCleanup
        cleanupExceptionKey={LeftColumnContent.ChatList}
        shouldWrap
        wrapExceptionKey={LeftColumnContent.ChatList}
      >
        {(isActive) => {
          switch (content) {
            case LeftColumnContent.Workspace:
              if (activeWorkspace) {
                return <Workspace workspace={activeWorkspace} />;
              }
              return undefined;
            case LeftColumnContent.ChatList:
              return (
                <div>
                  <div style="padding: 0.5rem;">
                    {/* eslint-disable-next-line react/jsx-no-bind */ }
                    <SearchInput onChange={() => {}} />
                  </div>
                  <ChatList isActive folderType="all" />
                </div>
              );
            case LeftColumnContent.Saved:
              return (
                <div style="height: 100%">
                  <div style="padding: 0.5rem;">
                    {/* eslint-disable-next-line react/jsx-no-bind */ }
                    <SearchInput onChange={() => {}} />
                  </div>
                  <ChatList isActive folderType="saved" />
                </div>
              );
            case LeftColumnContent.AllUnread:
              return (
                <div style="height: 100%">
                  <div style="padding: 0.5rem;">
                    {/* eslint-disable-next-line react/jsx-no-bind */ }
                    <SearchInput onChange={() => {}} />
                  </div>
                  <ChatList isActive folderType="all" category="unread" />
                </div>
              );
            case LeftColumnContent.Groups:
              return (
                <div style="height: 100%">
                  <div style="padding: 0.5rem;">
                    {/* eslint-disable-next-line react/jsx-no-bind */ }
                    <SearchInput onChange={() => {}} />
                  </div>
                  <ChatList isActive folderType="all" category="groups" />
                </div>
              );
            case LeftColumnContent.Channels:
              return (
                <div style="height: 100%">
                  <div style="padding: 0.5rem;">
                    {/* eslint-disable-next-line react/jsx-no-bind */ }
                    <SearchInput onChange={() => {}} />
                  </div>
                  <ChatList isActive folderType="all" category="channels" />
                </div>
              );
            case LeftColumnContent.Bots:
              return (
                <div style="height: 100%">
                  <div style="padding: 0.5rem;">
                    {/* eslint-disable-next-line react/jsx-no-bind */ }
                    <SearchInput onChange={() => {}} />
                  </div>
                  <ChatList isActive folderType="all" category="bots" />
                </div>
              );
            case LeftColumnContent.GlobalSearch:
              return (
                <LeftSearch
                  searchQuery={searchQuery}
                  searchDate={searchDate}
                  isActive={isActive}
                  onReset={onReset}
                />
              );
            case LeftColumnContent.Contacts:
              return <ContactList filter={contactsFilter} isActive={isActive} onReset={onReset} />;
            default:
              return undefined;
          }
        }}
      </Transition>
      {shouldRenderUpdateButton && (
        <Button
          fluid
          badge
          className={buildClassName('btn-update', updateButtonClassNames)}
          onClick={handleUpdateClick}
        >
          {lang('lng_update_telegram')}
        </Button>
      )}
      {shouldRenderForumPanel && (
        <ForumPanel
          isOpen={isForumPanelOpen}
          isHidden={!isForumPanelRendered}
          onTopicSearch={onTopicSearch}
          onOpenAnimationStart={handleForumPanelAnimationStart}
          onCloseAnimationEnd={handleForumPanelAnimationEnd}
        />
      )}
      <NewChatButton
        isShown={isNewChatButtonShown}
        onNewPrivateChat={handleSelectContacts}
        onNewChannel={handleSelectNewChannel}
        onNewGroup={handleSelectNewGroup}
        isAccountFrozen={isAccountFrozen}
      />
    </div>
  );
};

export default memo(withGlobal(
  (global): StateProps => {
    return {
      activeWorkspace: selectActiveWorkspace(global),
    };
  },
)(LeftMain));
