/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
var __webpack_exports__ = {};
/*!****************************************!*\
  !*** ./src/main/preload/antiRevoke.js ***!
  \****************************************/


const KEY_PREFIX = 'deleted_';
const BASE_URL = new URL('{{BASE_URL}}');
const myDeletedMessages = new Set();

function getDeletedPosts(channelId) {
  return JSON.parse(localStorage.getItem(`${KEY_PREFIX}${channelId}`)) || [];
}

function storePost(post) {
  const posts = getDeletedPosts(post.channel_id);
  posts.push(post);
  localStorage.setItem(`${KEY_PREFIX}${post.channel_id}`, JSON.stringify(posts));
}

window.clearDeletedPosts = function () {
  Object.keys(localStorage).filter(key => key.startsWith(KEY_PREFIX)).forEach(key => localStorage.removeItem(key));
};

function getReduxState() {
  var _document$getElementB, _document$getElementB2, _document$getElementB3;

  let reactRoot = (_document$getElementB = document.getElementById('root')) === null || _document$getElementB === void 0 ? void 0 : (_document$getElementB2 = _document$getElementB._reactRootContainer) === null || _document$getElementB2 === void 0 ? void 0 : (_document$getElementB3 = _document$getElementB2._internalRoot) === null || _document$getElementB3 === void 0 ? void 0 : _document$getElementB3.current;

  if (!reactRoot) {
    console.error('[!] Could not get internal root information from reactRoot element');
    return;
  }

  while (reactRoot) {
    var _reactRoot, _reactRoot$pendingPro, _reactRoot$pendingPro2;

    const reduxState = (_reactRoot = reactRoot) === null || _reactRoot === void 0 ? void 0 : (_reactRoot$pendingPro = _reactRoot.pendingProps) === null || _reactRoot$pendingPro === void 0 ? void 0 : (_reactRoot$pendingPro2 = _reactRoot$pendingPro.store) === null || _reactRoot$pendingPro2 === void 0 ? void 0 : _reactRoot$pendingPro2.getState();

    if (reduxState) {
      return reduxState;
    }

    reactRoot = reactRoot.child;
  }

  console.error('[!] Could not find redux state');
}

function getUserById(userId) {
  var _reduxState$entities, _reduxState$entities$, _profiles$userId;

  const reduxState = getReduxState();
  const profiles = reduxState === null || reduxState === void 0 ? void 0 : (_reduxState$entities = reduxState.entities) === null || _reduxState$entities === void 0 ? void 0 : (_reduxState$entities$ = _reduxState$entities.users) === null || _reduxState$entities$ === void 0 ? void 0 : _reduxState$entities$.profiles;
  return ((_profiles$userId = profiles[userId]) === null || _profiles$userId === void 0 ? void 0 : _profiles$userId.username) || userId;
}

function getPostInfo(postId) {
  const httpRequest = new XMLHttpRequest();
  httpRequest.open("POST", `${BASE_URL.origin}/api/v4/posts/ids`, false);
  httpRequest.setRequestHeader("x-requested-with", "XMLHttpRequest");
  httpRequest.send(JSON.stringify([postId]));

  if (httpRequest.status !== 200) {
    return;
  }

  return JSON.parse(httpRequest.response)[0];
}

function onMessageHook(evt, originalOnMessage) {
  var _msg$data, _getPostInfo, _getPostInfo$props;

  if (!evt) {
    return;
  }

  const msg = JSON.parse(evt.data);

  if (!msg.event || msg.event !== "post_deleted") {
    return originalOnMessage(evt);
  }

  const post = JSON.parse(msg.data.post);

  if (myDeletedMessages.has(post.id)) {
    myDeletedMessages.delete(post.id);
    return originalOnMessage(evt);
  }

  console.log('[*] Message deleted!');
  const now = new Date().getTime();
  const deletedBy = ((_msg$data = msg.data) === null || _msg$data === void 0 ? void 0 : _msg$data.delete_by) || ((_getPostInfo = getPostInfo(post.id)) === null || _getPostInfo === void 0 ? void 0 : (_getPostInfo$props = _getPostInfo.props) === null || _getPostInfo$props === void 0 ? void 0 : _getPostInfo$props.deleteBy);
  msg.event = "post_edited";
  post.update_at = now;
  post.edit_at = now;
  post.type = "system_ephemeral";
  post.message += ` - [sent by @${getUserById(post.user_id)}]` + (deletedBy ? ` - [deleted by @${getUserById(deletedBy)}]` : ''); // delete_by field is sent only to admin users.

  delete msg.data.delete_by;
  msg.data.post = JSON.stringify(post);
  storePost(post);
  return originalOnMessage(Object.assign({
    data: JSON.stringify(msg)
  }, evt));
}

function hookWebsocket() {
  const {
    get: onmessageGet,
    set: onmessageSet
  } = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
  Object.defineProperty(WebSocket.prototype, 'onmessage', {
    get() {
      return onmessageGet.apply(this);
    },

    set(...args) {
      if (args.length < 0 || typeof args[0] !== 'function') {
        return onmessageSet.apply(this, args);
      }

      console.log('[*] Hooking websocket!');
      const onMessageHandler = args[0];

      args[0] = evt => onMessageHook(evt, onMessageHandler);

      return onmessageSet.apply(this, args);
    }

  });
}

function onFetchPostsRequestHook(url, data) {
  const channelDeletedPosts = getDeletedPosts((url.pathname.match(/\/channels\/(\w*)\//) || [])[1]);

  if (!channelDeletedPosts.length) {
    return data;
  }

  let added = 0;
  data.order = data.order.reverse(); // Reversing the order to make the code simpler.

  const newOrder = [...data.order];

  for (let i = -1; i < data.order.length; i++) {
    const currPost = data.posts[data.order[i]] || {
      create_at: Number.MIN_SAFE_INTEGER
    };
    const nextPost = data.posts[data.order[i + 1]] || {
      create_at: Number.MAX_SAFE_INTEGER
    };
    channelDeletedPosts.filter(post => {
      return post.create_at >= currPost.create_at && post.create_at < nextPost.create_at;
    }).sort((post1, post2) => post1.create_at - post2.create_at).forEach(post => {
      if (!data.posts.hasOwnProperty(post.id)) {
        newOrder.splice(i + added + 1, 0, post.id);
        added++;
      }

      data.posts[post.id] = post;
    });
  }

  data.order = newOrder.reverse();
  return data;
}

function hookFetchRequests() {
  const {
    fetch: originalFetch
  } = window;

  window.fetch = async (url, options) => {
    try {
      url = new URL(url);
    } catch (_) {
      return await originalFetch(url, options);
    }

    if (url.origin !== BASE_URL.origin || !new RegExp(/\/posts(?:[\/]\w+)?$/).test(url.pathname)) {
      return await originalFetch(url, options);
    }

    if (options.method === 'delete') {
      myDeletedMessages.add(url.pathname.slice(url.pathname.lastIndexOf('/') + 1));
    }

    const response = await originalFetch(url, options);
    response.json = options.method === 'get' ? () => response.clone().json().then(data => onFetchPostsRequestHook(url, data)).catch(error => console.error(error)) : response.json;
    return response;
  };
}

hookFetchRequests();
hookWebsocket();
/******/ })()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW50aVJldm9rZS5qcyIsIm1hcHBpbmdzIjoiOzs7Ozs7QUFBYTs7QUFFYjtBQUNBLDRCQUE0QixVQUFVO0FBQ3RDOztBQUVBO0FBQ0EsNENBQTRDLFdBQVcsRUFBRSxVQUFVO0FBQ25FOztBQUVBO0FBQ0E7QUFDQTtBQUNBLDBCQUEwQixXQUFXLEVBQUUsZ0JBQWdCO0FBQ3ZEOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQSw4QkFBOEIsZ0JBQWdCO0FBQzlDO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTtBQUNBOztBQUVBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esa0NBQWtDLDBCQUEwQixxQ0FBcUMsdUJBQXVCLFVBQVU7O0FBRWxJO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxHQUFHO0FBQ0g7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJO0FBQ0o7QUFDQTtBQUNBO0FBQ0EsS0FBSzs7QUFFTDtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBOztBQUVBO0FBQ0E7O0FBRUEsR0FBRztBQUNIOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0EscUNBQXFDOztBQUVyQzs7QUFFQSxtQkFBbUIsdUJBQXVCO0FBQzFDO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQSxLQUFLO0FBQ0w7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBLElBQUk7O0FBRUo7QUFDQTtBQUNBO0FBQ0EsTUFBTTtBQUNOO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0EsZ0IiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9tYXR0ZXJtb3N0LWRlc2t0b3AvLi9zcmMvbWFpbi9wcmVsb2FkL2FudGlSZXZva2UuanMiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xuXG5jb25zdCBLRVlfUFJFRklYID0gJ2RlbGV0ZWRfJztcbmNvbnN0IEJBU0VfVVJMID0gbmV3IFVSTCgne3tCQVNFX1VSTH19Jyk7XG5jb25zdCBteURlbGV0ZWRNZXNzYWdlcyA9IG5ldyBTZXQoKTtcblxuZnVuY3Rpb24gZ2V0RGVsZXRlZFBvc3RzKGNoYW5uZWxJZCkge1xuICByZXR1cm4gSlNPTi5wYXJzZShsb2NhbFN0b3JhZ2UuZ2V0SXRlbShgJHtLRVlfUFJFRklYfSR7Y2hhbm5lbElkfWApKSB8fCBbXTtcbn1cblxuZnVuY3Rpb24gc3RvcmVQb3N0KHBvc3QpIHtcbiAgY29uc3QgcG9zdHMgPSBnZXREZWxldGVkUG9zdHMocG9zdC5jaGFubmVsX2lkKTtcbiAgcG9zdHMucHVzaChwb3N0KTtcbiAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oYCR7S0VZX1BSRUZJWH0ke3Bvc3QuY2hhbm5lbF9pZH1gLCBKU09OLnN0cmluZ2lmeShwb3N0cykpO1xufVxuXG53aW5kb3cuY2xlYXJEZWxldGVkUG9zdHMgPSBmdW5jdGlvbiAoKSB7XG4gIE9iamVjdC5rZXlzKGxvY2FsU3RvcmFnZSkuZmlsdGVyKGtleSA9PiBrZXkuc3RhcnRzV2l0aChLRVlfUFJFRklYKSkuZm9yRWFjaChrZXkgPT4gbG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oa2V5KSk7XG59O1xuXG5mdW5jdGlvbiBnZXRSZWR1eFN0YXRlKCkge1xuICB2YXIgX2RvY3VtZW50JGdldEVsZW1lbnRCLCBfZG9jdW1lbnQkZ2V0RWxlbWVudEIyLCBfZG9jdW1lbnQkZ2V0RWxlbWVudEIzO1xuXG4gIGxldCByZWFjdFJvb3QgPSAoX2RvY3VtZW50JGdldEVsZW1lbnRCID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Jvb3QnKSkgPT09IG51bGwgfHwgX2RvY3VtZW50JGdldEVsZW1lbnRCID09PSB2b2lkIDAgPyB2b2lkIDAgOiAoX2RvY3VtZW50JGdldEVsZW1lbnRCMiA9IF9kb2N1bWVudCRnZXRFbGVtZW50Qi5fcmVhY3RSb290Q29udGFpbmVyKSA9PT0gbnVsbCB8fCBfZG9jdW1lbnQkZ2V0RWxlbWVudEIyID09PSB2b2lkIDAgPyB2b2lkIDAgOiAoX2RvY3VtZW50JGdldEVsZW1lbnRCMyA9IF9kb2N1bWVudCRnZXRFbGVtZW50QjIuX2ludGVybmFsUm9vdCkgPT09IG51bGwgfHwgX2RvY3VtZW50JGdldEVsZW1lbnRCMyA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2RvY3VtZW50JGdldEVsZW1lbnRCMy5jdXJyZW50O1xuXG4gIGlmICghcmVhY3RSb290KSB7XG4gICAgY29uc29sZS5lcnJvcignWyFdIENvdWxkIG5vdCBnZXQgaW50ZXJuYWwgcm9vdCBpbmZvcm1hdGlvbiBmcm9tIHJlYWN0Um9vdCBlbGVtZW50Jyk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgd2hpbGUgKHJlYWN0Um9vdCkge1xuICAgIHZhciBfcmVhY3RSb290LCBfcmVhY3RSb290JHBlbmRpbmdQcm8sIF9yZWFjdFJvb3QkcGVuZGluZ1BybzI7XG5cbiAgICBjb25zdCByZWR1eFN0YXRlID0gKF9yZWFjdFJvb3QgPSByZWFjdFJvb3QpID09PSBudWxsIHx8IF9yZWFjdFJvb3QgPT09IHZvaWQgMCA/IHZvaWQgMCA6IChfcmVhY3RSb290JHBlbmRpbmdQcm8gPSBfcmVhY3RSb290LnBlbmRpbmdQcm9wcykgPT09IG51bGwgfHwgX3JlYWN0Um9vdCRwZW5kaW5nUHJvID09PSB2b2lkIDAgPyB2b2lkIDAgOiAoX3JlYWN0Um9vdCRwZW5kaW5nUHJvMiA9IF9yZWFjdFJvb3QkcGVuZGluZ1Byby5zdG9yZSkgPT09IG51bGwgfHwgX3JlYWN0Um9vdCRwZW5kaW5nUHJvMiA9PT0gdm9pZCAwID8gdm9pZCAwIDogX3JlYWN0Um9vdCRwZW5kaW5nUHJvMi5nZXRTdGF0ZSgpO1xuXG4gICAgaWYgKHJlZHV4U3RhdGUpIHtcbiAgICAgIHJldHVybiByZWR1eFN0YXRlO1xuICAgIH1cblxuICAgIHJlYWN0Um9vdCA9IHJlYWN0Um9vdC5jaGlsZDtcbiAgfVxuXG4gIGNvbnNvbGUuZXJyb3IoJ1shXSBDb3VsZCBub3QgZmluZCByZWR1eCBzdGF0ZScpO1xufVxuXG5mdW5jdGlvbiBnZXRVc2VyQnlJZCh1c2VySWQpIHtcbiAgdmFyIF9yZWR1eFN0YXRlJGVudGl0aWVzLCBfcmVkdXhTdGF0ZSRlbnRpdGllcyQsIF9wcm9maWxlcyR1c2VySWQ7XG5cbiAgY29uc3QgcmVkdXhTdGF0ZSA9IGdldFJlZHV4U3RhdGUoKTtcbiAgY29uc3QgcHJvZmlsZXMgPSByZWR1eFN0YXRlID09PSBudWxsIHx8IHJlZHV4U3RhdGUgPT09IHZvaWQgMCA/IHZvaWQgMCA6IChfcmVkdXhTdGF0ZSRlbnRpdGllcyA9IHJlZHV4U3RhdGUuZW50aXRpZXMpID09PSBudWxsIHx8IF9yZWR1eFN0YXRlJGVudGl0aWVzID09PSB2b2lkIDAgPyB2b2lkIDAgOiAoX3JlZHV4U3RhdGUkZW50aXRpZXMkID0gX3JlZHV4U3RhdGUkZW50aXRpZXMudXNlcnMpID09PSBudWxsIHx8IF9yZWR1eFN0YXRlJGVudGl0aWVzJCA9PT0gdm9pZCAwID8gdm9pZCAwIDogX3JlZHV4U3RhdGUkZW50aXRpZXMkLnByb2ZpbGVzO1xuICByZXR1cm4gKChfcHJvZmlsZXMkdXNlcklkID0gcHJvZmlsZXNbdXNlcklkXSkgPT09IG51bGwgfHwgX3Byb2ZpbGVzJHVzZXJJZCA9PT0gdm9pZCAwID8gdm9pZCAwIDogX3Byb2ZpbGVzJHVzZXJJZC51c2VybmFtZSkgfHwgdXNlcklkO1xufVxuXG5mdW5jdGlvbiBnZXRQb3N0SW5mbyhwb3N0SWQpIHtcbiAgY29uc3QgaHR0cFJlcXVlc3QgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgaHR0cFJlcXVlc3Qub3BlbihcIlBPU1RcIiwgYCR7QkFTRV9VUkwub3JpZ2lufS9hcGkvdjQvcG9zdHMvaWRzYCwgZmFsc2UpO1xuICBodHRwUmVxdWVzdC5zZXRSZXF1ZXN0SGVhZGVyKFwieC1yZXF1ZXN0ZWQtd2l0aFwiLCBcIlhNTEh0dHBSZXF1ZXN0XCIpO1xuICBodHRwUmVxdWVzdC5zZW5kKEpTT04uc3RyaW5naWZ5KFtwb3N0SWRdKSk7XG5cbiAgaWYgKGh0dHBSZXF1ZXN0LnN0YXR1cyAhPT0gMjAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgcmV0dXJuIEpTT04ucGFyc2UoaHR0cFJlcXVlc3QucmVzcG9uc2UpWzBdO1xufVxuXG5mdW5jdGlvbiBvbk1lc3NhZ2VIb29rKGV2dCwgb3JpZ2luYWxPbk1lc3NhZ2UpIHtcbiAgdmFyIF9tc2ckZGF0YSwgX2dldFBvc3RJbmZvLCBfZ2V0UG9zdEluZm8kcHJvcHM7XG5cbiAgaWYgKCFldnQpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBtc2cgPSBKU09OLnBhcnNlKGV2dC5kYXRhKTtcblxuICBpZiAoIW1zZy5ldmVudCB8fCBtc2cuZXZlbnQgIT09IFwicG9zdF9kZWxldGVkXCIpIHtcbiAgICByZXR1cm4gb3JpZ2luYWxPbk1lc3NhZ2UoZXZ0KTtcbiAgfVxuXG4gIGNvbnN0IHBvc3QgPSBKU09OLnBhcnNlKG1zZy5kYXRhLnBvc3QpO1xuXG4gIGlmIChteURlbGV0ZWRNZXNzYWdlcy5oYXMocG9zdC5pZCkpIHtcbiAgICBteURlbGV0ZWRNZXNzYWdlcy5kZWxldGUocG9zdC5pZCk7XG4gICAgcmV0dXJuIG9yaWdpbmFsT25NZXNzYWdlKGV2dCk7XG4gIH1cblxuICBjb25zb2xlLmxvZygnWypdIE1lc3NhZ2UgZGVsZXRlZCEnKTtcbiAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gIGNvbnN0IGRlbGV0ZWRCeSA9ICgoX21zZyRkYXRhID0gbXNnLmRhdGEpID09PSBudWxsIHx8IF9tc2ckZGF0YSA9PT0gdm9pZCAwID8gdm9pZCAwIDogX21zZyRkYXRhLmRlbGV0ZV9ieSkgfHwgKChfZ2V0UG9zdEluZm8gPSBnZXRQb3N0SW5mbyhwb3N0LmlkKSkgPT09IG51bGwgfHwgX2dldFBvc3RJbmZvID09PSB2b2lkIDAgPyB2b2lkIDAgOiAoX2dldFBvc3RJbmZvJHByb3BzID0gX2dldFBvc3RJbmZvLnByb3BzKSA9PT0gbnVsbCB8fCBfZ2V0UG9zdEluZm8kcHJvcHMgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9nZXRQb3N0SW5mbyRwcm9wcy5kZWxldGVCeSk7XG4gIG1zZy5ldmVudCA9IFwicG9zdF9lZGl0ZWRcIjtcbiAgcG9zdC51cGRhdGVfYXQgPSBub3c7XG4gIHBvc3QuZWRpdF9hdCA9IG5vdztcbiAgcG9zdC50eXBlID0gXCJzeXN0ZW1fZXBoZW1lcmFsXCI7XG4gIHBvc3QubWVzc2FnZSArPSBgIC0gW3NlbnQgYnkgQCR7Z2V0VXNlckJ5SWQocG9zdC51c2VyX2lkKX1dYCArIChkZWxldGVkQnkgPyBgIC0gW2RlbGV0ZWQgYnkgQCR7Z2V0VXNlckJ5SWQoZGVsZXRlZEJ5KX1dYCA6ICcnKTsgLy8gZGVsZXRlX2J5IGZpZWxkIGlzIHNlbnQgb25seSB0byBhZG1pbiB1c2Vycy5cblxuICBkZWxldGUgbXNnLmRhdGEuZGVsZXRlX2J5O1xuICBtc2cuZGF0YS5wb3N0ID0gSlNPTi5zdHJpbmdpZnkocG9zdCk7XG4gIHN0b3JlUG9zdChwb3N0KTtcbiAgcmV0dXJuIG9yaWdpbmFsT25NZXNzYWdlKE9iamVjdC5hc3NpZ24oe1xuICAgIGRhdGE6IEpTT04uc3RyaW5naWZ5KG1zZylcbiAgfSwgZXZ0KSk7XG59XG5cbmZ1bmN0aW9uIGhvb2tXZWJzb2NrZXQoKSB7XG4gIGNvbnN0IHtcbiAgICBnZXQ6IG9ubWVzc2FnZUdldCxcbiAgICBzZXQ6IG9ubWVzc2FnZVNldFxuICB9ID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihXZWJTb2NrZXQucHJvdG90eXBlLCAnb25tZXNzYWdlJyk7XG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShXZWJTb2NrZXQucHJvdG90eXBlLCAnb25tZXNzYWdlJywge1xuICAgIGdldCgpIHtcbiAgICAgIHJldHVybiBvbm1lc3NhZ2VHZXQuYXBwbHkodGhpcyk7XG4gICAgfSxcblxuICAgIHNldCguLi5hcmdzKSB7XG4gICAgICBpZiAoYXJncy5sZW5ndGggPCAwIHx8IHR5cGVvZiBhcmdzWzBdICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHJldHVybiBvbm1lc3NhZ2VTZXQuYXBwbHkodGhpcywgYXJncyk7XG4gICAgICB9XG5cbiAgICAgIGNvbnNvbGUubG9nKCdbKl0gSG9va2luZyB3ZWJzb2NrZXQhJyk7XG4gICAgICBjb25zdCBvbk1lc3NhZ2VIYW5kbGVyID0gYXJnc1swXTtcblxuICAgICAgYXJnc1swXSA9IGV2dCA9PiBvbk1lc3NhZ2VIb29rKGV2dCwgb25NZXNzYWdlSGFuZGxlcik7XG5cbiAgICAgIHJldHVybiBvbm1lc3NhZ2VTZXQuYXBwbHkodGhpcywgYXJncyk7XG4gICAgfVxuXG4gIH0pO1xufVxuXG5mdW5jdGlvbiBvbkZldGNoUG9zdHNSZXF1ZXN0SG9vayh1cmwsIGRhdGEpIHtcbiAgY29uc3QgY2hhbm5lbERlbGV0ZWRQb3N0cyA9IGdldERlbGV0ZWRQb3N0cygodXJsLnBhdGhuYW1lLm1hdGNoKC9cXC9jaGFubmVsc1xcLyhcXHcqKVxcLy8pIHx8IFtdKVsxXSk7XG5cbiAgaWYgKCFjaGFubmVsRGVsZXRlZFBvc3RzLmxlbmd0aCkge1xuICAgIHJldHVybiBkYXRhO1xuICB9XG5cbiAgbGV0IGFkZGVkID0gMDtcbiAgZGF0YS5vcmRlciA9IGRhdGEub3JkZXIucmV2ZXJzZSgpOyAvLyBSZXZlcnNpbmcgdGhlIG9yZGVyIHRvIG1ha2UgdGhlIGNvZGUgc2ltcGxlci5cblxuICBjb25zdCBuZXdPcmRlciA9IFsuLi5kYXRhLm9yZGVyXTtcblxuICBmb3IgKGxldCBpID0gLTE7IGkgPCBkYXRhLm9yZGVyLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgY3VyclBvc3QgPSBkYXRhLnBvc3RzW2RhdGEub3JkZXJbaV1dIHx8IHtcbiAgICAgIGNyZWF0ZV9hdDogTnVtYmVyLk1JTl9TQUZFX0lOVEVHRVJcbiAgICB9O1xuICAgIGNvbnN0IG5leHRQb3N0ID0gZGF0YS5wb3N0c1tkYXRhLm9yZGVyW2kgKyAxXV0gfHwge1xuICAgICAgY3JlYXRlX2F0OiBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUlxuICAgIH07XG4gICAgY2hhbm5lbERlbGV0ZWRQb3N0cy5maWx0ZXIocG9zdCA9PiB7XG4gICAgICByZXR1cm4gcG9zdC5jcmVhdGVfYXQgPj0gY3VyclBvc3QuY3JlYXRlX2F0ICYmIHBvc3QuY3JlYXRlX2F0IDwgbmV4dFBvc3QuY3JlYXRlX2F0O1xuICAgIH0pLnNvcnQoKHBvc3QxLCBwb3N0MikgPT4gcG9zdDEuY3JlYXRlX2F0IC0gcG9zdDIuY3JlYXRlX2F0KS5mb3JFYWNoKHBvc3QgPT4ge1xuICAgICAgaWYgKCFkYXRhLnBvc3RzLmhhc093blByb3BlcnR5KHBvc3QuaWQpKSB7XG4gICAgICAgIG5ld09yZGVyLnNwbGljZShpICsgYWRkZWQgKyAxLCAwLCBwb3N0LmlkKTtcbiAgICAgICAgYWRkZWQrKztcbiAgICAgIH1cblxuICAgICAgZGF0YS5wb3N0c1twb3N0LmlkXSA9IHBvc3Q7XG4gICAgfSk7XG4gIH1cblxuICBkYXRhLm9yZGVyID0gbmV3T3JkZXIucmV2ZXJzZSgpO1xuICByZXR1cm4gZGF0YTtcbn1cblxuZnVuY3Rpb24gaG9va0ZldGNoUmVxdWVzdHMoKSB7XG4gIGNvbnN0IHtcbiAgICBmZXRjaDogb3JpZ2luYWxGZXRjaFxuICB9ID0gd2luZG93O1xuXG4gIHdpbmRvdy5mZXRjaCA9IGFzeW5jICh1cmwsIG9wdGlvbnMpID0+IHtcbiAgICB0cnkge1xuICAgICAgdXJsID0gbmV3IFVSTCh1cmwpO1xuICAgIH0gY2F0Y2ggKF8pIHtcbiAgICAgIHJldHVybiBhd2FpdCBvcmlnaW5hbEZldGNoKHVybCwgb3B0aW9ucyk7XG4gICAgfVxuXG4gICAgaWYgKHVybC5vcmlnaW4gIT09IEJBU0VfVVJMLm9yaWdpbiB8fCAhbmV3IFJlZ0V4cCgvXFwvcG9zdHMoPzpbXFwvXVxcdyspPyQvKS50ZXN0KHVybC5wYXRobmFtZSkpIHtcbiAgICAgIHJldHVybiBhd2FpdCBvcmlnaW5hbEZldGNoKHVybCwgb3B0aW9ucyk7XG4gICAgfVxuXG4gICAgaWYgKG9wdGlvbnMubWV0aG9kID09PSAnZGVsZXRlJykge1xuICAgICAgbXlEZWxldGVkTWVzc2FnZXMuYWRkKHVybC5wYXRobmFtZS5zbGljZSh1cmwucGF0aG5hbWUubGFzdEluZGV4T2YoJy8nKSArIDEpKTtcbiAgICB9XG5cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG9yaWdpbmFsRmV0Y2godXJsLCBvcHRpb25zKTtcbiAgICByZXNwb25zZS5qc29uID0gb3B0aW9ucy5tZXRob2QgPT09ICdnZXQnID8gKCkgPT4gcmVzcG9uc2UuY2xvbmUoKS5qc29uKCkudGhlbihkYXRhID0+IG9uRmV0Y2hQb3N0c1JlcXVlc3RIb29rKHVybCwgZGF0YSkpLmNhdGNoKGVycm9yID0+IGNvbnNvbGUuZXJyb3IoZXJyb3IpKSA6IHJlc3BvbnNlLmpzb247XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9O1xufVxuXG5ob29rRmV0Y2hSZXF1ZXN0cygpO1xuaG9va1dlYnNvY2tldCgpOyJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==