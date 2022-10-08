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

  for (let i = 0; i < data.order.length; i++) {
    const currPost = data.posts[data.order[i]];
    const nextPost = i + 1 >= data.order.length ? {
      create_at: Number.MAX_SAFE_INTEGER
    } : data.posts[data.order[i + 1]];
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW50aVJldm9rZS5qcyIsIm1hcHBpbmdzIjoiOzs7Ozs7QUFBYTs7QUFFYjtBQUNBLDRCQUE0QixVQUFVO0FBQ3RDOztBQUVBO0FBQ0EsNENBQTRDLFdBQVcsRUFBRSxVQUFVO0FBQ25FOztBQUVBO0FBQ0E7QUFDQTtBQUNBLDBCQUEwQixXQUFXLEVBQUUsZ0JBQWdCO0FBQ3ZEOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQSw4QkFBOEIsZ0JBQWdCO0FBQzlDO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTtBQUNBOztBQUVBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esa0NBQWtDLDBCQUEwQixxQ0FBcUMsdUJBQXVCLFVBQVU7O0FBRWxJO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxHQUFHO0FBQ0g7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJO0FBQ0o7QUFDQTtBQUNBO0FBQ0EsS0FBSzs7QUFFTDtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBOztBQUVBO0FBQ0E7O0FBRUEsR0FBRztBQUNIOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0EscUNBQXFDOztBQUVyQzs7QUFFQSxrQkFBa0IsdUJBQXVCO0FBQ3pDO0FBQ0E7QUFDQTtBQUNBLE1BQU07QUFDTjtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0EsS0FBSztBQUNMOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQSxJQUFJOztBQUVKO0FBQ0E7QUFDQTtBQUNBLE1BQU07QUFDTjtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLGdCIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vbWF0dGVybW9zdC1kZXNrdG9wLy4vc3JjL21haW4vcHJlbG9hZC9hbnRpUmV2b2tlLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcblxuY29uc3QgS0VZX1BSRUZJWCA9ICdkZWxldGVkXyc7XG5jb25zdCBCQVNFX1VSTCA9IG5ldyBVUkwoJ3t7QkFTRV9VUkx9fScpO1xuY29uc3QgbXlEZWxldGVkTWVzc2FnZXMgPSBuZXcgU2V0KCk7XG5cbmZ1bmN0aW9uIGdldERlbGV0ZWRQb3N0cyhjaGFubmVsSWQpIHtcbiAgcmV0dXJuIEpTT04ucGFyc2UobG9jYWxTdG9yYWdlLmdldEl0ZW0oYCR7S0VZX1BSRUZJWH0ke2NoYW5uZWxJZH1gKSkgfHwgW107XG59XG5cbmZ1bmN0aW9uIHN0b3JlUG9zdChwb3N0KSB7XG4gIGNvbnN0IHBvc3RzID0gZ2V0RGVsZXRlZFBvc3RzKHBvc3QuY2hhbm5lbF9pZCk7XG4gIHBvc3RzLnB1c2gocG9zdCk7XG4gIGxvY2FsU3RvcmFnZS5zZXRJdGVtKGAke0tFWV9QUkVGSVh9JHtwb3N0LmNoYW5uZWxfaWR9YCwgSlNPTi5zdHJpbmdpZnkocG9zdHMpKTtcbn1cblxud2luZG93LmNsZWFyRGVsZXRlZFBvc3RzID0gZnVuY3Rpb24gKCkge1xuICBPYmplY3Qua2V5cyhsb2NhbFN0b3JhZ2UpLmZpbHRlcihrZXkgPT4ga2V5LnN0YXJ0c1dpdGgoS0VZX1BSRUZJWCkpLmZvckVhY2goa2V5ID0+IGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKGtleSkpO1xufTtcblxuZnVuY3Rpb24gZ2V0UmVkdXhTdGF0ZSgpIHtcbiAgdmFyIF9kb2N1bWVudCRnZXRFbGVtZW50QiwgX2RvY3VtZW50JGdldEVsZW1lbnRCMiwgX2RvY3VtZW50JGdldEVsZW1lbnRCMztcblxuICBsZXQgcmVhY3RSb290ID0gKF9kb2N1bWVudCRnZXRFbGVtZW50QiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyb290JykpID09PSBudWxsIHx8IF9kb2N1bWVudCRnZXRFbGVtZW50QiA9PT0gdm9pZCAwID8gdm9pZCAwIDogKF9kb2N1bWVudCRnZXRFbGVtZW50QjIgPSBfZG9jdW1lbnQkZ2V0RWxlbWVudEIuX3JlYWN0Um9vdENvbnRhaW5lcikgPT09IG51bGwgfHwgX2RvY3VtZW50JGdldEVsZW1lbnRCMiA9PT0gdm9pZCAwID8gdm9pZCAwIDogKF9kb2N1bWVudCRnZXRFbGVtZW50QjMgPSBfZG9jdW1lbnQkZ2V0RWxlbWVudEIyLl9pbnRlcm5hbFJvb3QpID09PSBudWxsIHx8IF9kb2N1bWVudCRnZXRFbGVtZW50QjMgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9kb2N1bWVudCRnZXRFbGVtZW50QjMuY3VycmVudDtcblxuICBpZiAoIXJlYWN0Um9vdCkge1xuICAgIGNvbnNvbGUuZXJyb3IoJ1shXSBDb3VsZCBub3QgZ2V0IGludGVybmFsIHJvb3QgaW5mb3JtYXRpb24gZnJvbSByZWFjdFJvb3QgZWxlbWVudCcpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHdoaWxlIChyZWFjdFJvb3QpIHtcbiAgICB2YXIgX3JlYWN0Um9vdCwgX3JlYWN0Um9vdCRwZW5kaW5nUHJvLCBfcmVhY3RSb290JHBlbmRpbmdQcm8yO1xuXG4gICAgY29uc3QgcmVkdXhTdGF0ZSA9IChfcmVhY3RSb290ID0gcmVhY3RSb290KSA9PT0gbnVsbCB8fCBfcmVhY3RSb290ID09PSB2b2lkIDAgPyB2b2lkIDAgOiAoX3JlYWN0Um9vdCRwZW5kaW5nUHJvID0gX3JlYWN0Um9vdC5wZW5kaW5nUHJvcHMpID09PSBudWxsIHx8IF9yZWFjdFJvb3QkcGVuZGluZ1BybyA9PT0gdm9pZCAwID8gdm9pZCAwIDogKF9yZWFjdFJvb3QkcGVuZGluZ1BybzIgPSBfcmVhY3RSb290JHBlbmRpbmdQcm8uc3RvcmUpID09PSBudWxsIHx8IF9yZWFjdFJvb3QkcGVuZGluZ1BybzIgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9yZWFjdFJvb3QkcGVuZGluZ1BybzIuZ2V0U3RhdGUoKTtcblxuICAgIGlmIChyZWR1eFN0YXRlKSB7XG4gICAgICByZXR1cm4gcmVkdXhTdGF0ZTtcbiAgICB9XG5cbiAgICByZWFjdFJvb3QgPSByZWFjdFJvb3QuY2hpbGQ7XG4gIH1cblxuICBjb25zb2xlLmVycm9yKCdbIV0gQ291bGQgbm90IGZpbmQgcmVkdXggc3RhdGUnKTtcbn1cblxuZnVuY3Rpb24gZ2V0VXNlckJ5SWQodXNlcklkKSB7XG4gIHZhciBfcmVkdXhTdGF0ZSRlbnRpdGllcywgX3JlZHV4U3RhdGUkZW50aXRpZXMkLCBfcHJvZmlsZXMkdXNlcklkO1xuXG4gIGNvbnN0IHJlZHV4U3RhdGUgPSBnZXRSZWR1eFN0YXRlKCk7XG4gIGNvbnN0IHByb2ZpbGVzID0gcmVkdXhTdGF0ZSA9PT0gbnVsbCB8fCByZWR1eFN0YXRlID09PSB2b2lkIDAgPyB2b2lkIDAgOiAoX3JlZHV4U3RhdGUkZW50aXRpZXMgPSByZWR1eFN0YXRlLmVudGl0aWVzKSA9PT0gbnVsbCB8fCBfcmVkdXhTdGF0ZSRlbnRpdGllcyA9PT0gdm9pZCAwID8gdm9pZCAwIDogKF9yZWR1eFN0YXRlJGVudGl0aWVzJCA9IF9yZWR1eFN0YXRlJGVudGl0aWVzLnVzZXJzKSA9PT0gbnVsbCB8fCBfcmVkdXhTdGF0ZSRlbnRpdGllcyQgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9yZWR1eFN0YXRlJGVudGl0aWVzJC5wcm9maWxlcztcbiAgcmV0dXJuICgoX3Byb2ZpbGVzJHVzZXJJZCA9IHByb2ZpbGVzW3VzZXJJZF0pID09PSBudWxsIHx8IF9wcm9maWxlcyR1c2VySWQgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9wcm9maWxlcyR1c2VySWQudXNlcm5hbWUpIHx8IHVzZXJJZDtcbn1cblxuZnVuY3Rpb24gZ2V0UG9zdEluZm8ocG9zdElkKSB7XG4gIGNvbnN0IGh0dHBSZXF1ZXN0ID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG4gIGh0dHBSZXF1ZXN0Lm9wZW4oXCJQT1NUXCIsIGAke0JBU0VfVVJMLm9yaWdpbn0vYXBpL3Y0L3Bvc3RzL2lkc2AsIGZhbHNlKTtcbiAgaHR0cFJlcXVlc3Quc2V0UmVxdWVzdEhlYWRlcihcIngtcmVxdWVzdGVkLXdpdGhcIiwgXCJYTUxIdHRwUmVxdWVzdFwiKTtcbiAgaHR0cFJlcXVlc3Quc2VuZChKU09OLnN0cmluZ2lmeShbcG9zdElkXSkpO1xuXG4gIGlmIChodHRwUmVxdWVzdC5zdGF0dXMgIT09IDIwMCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHJldHVybiBKU09OLnBhcnNlKGh0dHBSZXF1ZXN0LnJlc3BvbnNlKVswXTtcbn1cblxuZnVuY3Rpb24gb25NZXNzYWdlSG9vayhldnQsIG9yaWdpbmFsT25NZXNzYWdlKSB7XG4gIHZhciBfbXNnJGRhdGEsIF9nZXRQb3N0SW5mbywgX2dldFBvc3RJbmZvJHByb3BzO1xuXG4gIGlmICghZXZ0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgbXNnID0gSlNPTi5wYXJzZShldnQuZGF0YSk7XG5cbiAgaWYgKCFtc2cuZXZlbnQgfHwgbXNnLmV2ZW50ICE9PSBcInBvc3RfZGVsZXRlZFwiKSB7XG4gICAgcmV0dXJuIG9yaWdpbmFsT25NZXNzYWdlKGV2dCk7XG4gIH1cblxuICBjb25zdCBwb3N0ID0gSlNPTi5wYXJzZShtc2cuZGF0YS5wb3N0KTtcblxuICBpZiAobXlEZWxldGVkTWVzc2FnZXMuaGFzKHBvc3QuaWQpKSB7XG4gICAgbXlEZWxldGVkTWVzc2FnZXMuZGVsZXRlKHBvc3QuaWQpO1xuICAgIHJldHVybiBvcmlnaW5hbE9uTWVzc2FnZShldnQpO1xuICB9XG5cbiAgY29uc29sZS5sb2coJ1sqXSBNZXNzYWdlIGRlbGV0ZWQhJyk7XG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICBjb25zdCBkZWxldGVkQnkgPSAoKF9tc2ckZGF0YSA9IG1zZy5kYXRhKSA9PT0gbnVsbCB8fCBfbXNnJGRhdGEgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9tc2ckZGF0YS5kZWxldGVfYnkpIHx8ICgoX2dldFBvc3RJbmZvID0gZ2V0UG9zdEluZm8ocG9zdC5pZCkpID09PSBudWxsIHx8IF9nZXRQb3N0SW5mbyA9PT0gdm9pZCAwID8gdm9pZCAwIDogKF9nZXRQb3N0SW5mbyRwcm9wcyA9IF9nZXRQb3N0SW5mby5wcm9wcykgPT09IG51bGwgfHwgX2dldFBvc3RJbmZvJHByb3BzID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfZ2V0UG9zdEluZm8kcHJvcHMuZGVsZXRlQnkpO1xuICBtc2cuZXZlbnQgPSBcInBvc3RfZWRpdGVkXCI7XG4gIHBvc3QudXBkYXRlX2F0ID0gbm93O1xuICBwb3N0LmVkaXRfYXQgPSBub3c7XG4gIHBvc3QudHlwZSA9IFwic3lzdGVtX2VwaGVtZXJhbFwiO1xuICBwb3N0Lm1lc3NhZ2UgKz0gYCAtIFtzZW50IGJ5IEAke2dldFVzZXJCeUlkKHBvc3QudXNlcl9pZCl9XWAgKyAoZGVsZXRlZEJ5ID8gYCAtIFtkZWxldGVkIGJ5IEAke2dldFVzZXJCeUlkKGRlbGV0ZWRCeSl9XWAgOiAnJyk7IC8vIGRlbGV0ZV9ieSBmaWVsZCBpcyBzZW50IG9ubHkgdG8gYWRtaW4gdXNlcnMuXG5cbiAgZGVsZXRlIG1zZy5kYXRhLmRlbGV0ZV9ieTtcbiAgbXNnLmRhdGEucG9zdCA9IEpTT04uc3RyaW5naWZ5KHBvc3QpO1xuICBzdG9yZVBvc3QocG9zdCk7XG4gIHJldHVybiBvcmlnaW5hbE9uTWVzc2FnZShPYmplY3QuYXNzaWduKHtcbiAgICBkYXRhOiBKU09OLnN0cmluZ2lmeShtc2cpXG4gIH0sIGV2dCkpO1xufVxuXG5mdW5jdGlvbiBob29rV2Vic29ja2V0KCkge1xuICBjb25zdCB7XG4gICAgZ2V0OiBvbm1lc3NhZ2VHZXQsXG4gICAgc2V0OiBvbm1lc3NhZ2VTZXRcbiAgfSA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoV2ViU29ja2V0LnByb3RvdHlwZSwgJ29ubWVzc2FnZScpO1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoV2ViU29ja2V0LnByb3RvdHlwZSwgJ29ubWVzc2FnZScsIHtcbiAgICBnZXQoKSB7XG4gICAgICByZXR1cm4gb25tZXNzYWdlR2V0LmFwcGx5KHRoaXMpO1xuICAgIH0sXG5cbiAgICBzZXQoLi4uYXJncykge1xuICAgICAgaWYgKGFyZ3MubGVuZ3RoIDwgMCB8fCB0eXBlb2YgYXJnc1swXSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICByZXR1cm4gb25tZXNzYWdlU2V0LmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgICAgfVxuXG4gICAgICBjb25zb2xlLmxvZygnWypdIEhvb2tpbmcgd2Vic29ja2V0IScpO1xuICAgICAgY29uc3Qgb25NZXNzYWdlSGFuZGxlciA9IGFyZ3NbMF07XG5cbiAgICAgIGFyZ3NbMF0gPSBldnQgPT4gb25NZXNzYWdlSG9vayhldnQsIG9uTWVzc2FnZUhhbmRsZXIpO1xuXG4gICAgICByZXR1cm4gb25tZXNzYWdlU2V0LmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgIH1cblxuICB9KTtcbn1cblxuZnVuY3Rpb24gb25GZXRjaFBvc3RzUmVxdWVzdEhvb2sodXJsLCBkYXRhKSB7XG4gIGNvbnN0IGNoYW5uZWxEZWxldGVkUG9zdHMgPSBnZXREZWxldGVkUG9zdHMoKHVybC5wYXRobmFtZS5tYXRjaCgvXFwvY2hhbm5lbHNcXC8oXFx3KilcXC8vKSB8fCBbXSlbMV0pO1xuXG4gIGlmICghY2hhbm5lbERlbGV0ZWRQb3N0cy5sZW5ndGgpIHtcbiAgICByZXR1cm4gZGF0YTtcbiAgfVxuXG4gIGxldCBhZGRlZCA9IDA7XG4gIGRhdGEub3JkZXIgPSBkYXRhLm9yZGVyLnJldmVyc2UoKTsgLy8gUmV2ZXJzaW5nIHRoZSBvcmRlciB0byBtYWtlIHRoZSBjb2RlIHNpbXBsZXIuXG5cbiAgY29uc3QgbmV3T3JkZXIgPSBbLi4uZGF0YS5vcmRlcl07XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBkYXRhLm9yZGVyLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgY3VyclBvc3QgPSBkYXRhLnBvc3RzW2RhdGEub3JkZXJbaV1dO1xuICAgIGNvbnN0IG5leHRQb3N0ID0gaSArIDEgPj0gZGF0YS5vcmRlci5sZW5ndGggPyB7XG4gICAgICBjcmVhdGVfYXQ6IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSXG4gICAgfSA6IGRhdGEucG9zdHNbZGF0YS5vcmRlcltpICsgMV1dO1xuICAgIGNoYW5uZWxEZWxldGVkUG9zdHMuZmlsdGVyKHBvc3QgPT4ge1xuICAgICAgcmV0dXJuIHBvc3QuY3JlYXRlX2F0ID49IGN1cnJQb3N0LmNyZWF0ZV9hdCAmJiBwb3N0LmNyZWF0ZV9hdCA8IG5leHRQb3N0LmNyZWF0ZV9hdDtcbiAgICB9KS5zb3J0KChwb3N0MSwgcG9zdDIpID0+IHBvc3QxLmNyZWF0ZV9hdCAtIHBvc3QyLmNyZWF0ZV9hdCkuZm9yRWFjaChwb3N0ID0+IHtcbiAgICAgIGlmICghZGF0YS5wb3N0cy5oYXNPd25Qcm9wZXJ0eShwb3N0LmlkKSkge1xuICAgICAgICBuZXdPcmRlci5zcGxpY2UoaSArIGFkZGVkICsgMSwgMCwgcG9zdC5pZCk7XG4gICAgICAgIGFkZGVkKys7XG4gICAgICB9XG5cbiAgICAgIGRhdGEucG9zdHNbcG9zdC5pZF0gPSBwb3N0O1xuICAgIH0pO1xuICB9XG5cbiAgZGF0YS5vcmRlciA9IG5ld09yZGVyLnJldmVyc2UoKTtcbiAgcmV0dXJuIGRhdGE7XG59XG5cbmZ1bmN0aW9uIGhvb2tGZXRjaFJlcXVlc3RzKCkge1xuICBjb25zdCB7XG4gICAgZmV0Y2g6IG9yaWdpbmFsRmV0Y2hcbiAgfSA9IHdpbmRvdztcblxuICB3aW5kb3cuZmV0Y2ggPSBhc3luYyAodXJsLCBvcHRpb25zKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIHVybCA9IG5ldyBVUkwodXJsKTtcbiAgICB9IGNhdGNoIChfKSB7XG4gICAgICByZXR1cm4gYXdhaXQgb3JpZ2luYWxGZXRjaCh1cmwsIG9wdGlvbnMpO1xuICAgIH1cblxuICAgIGlmICh1cmwub3JpZ2luICE9PSBCQVNFX1VSTC5vcmlnaW4gfHwgIW5ldyBSZWdFeHAoL1xcL3Bvc3RzKD86W1xcL11cXHcrKT8kLykudGVzdCh1cmwucGF0aG5hbWUpKSB7XG4gICAgICByZXR1cm4gYXdhaXQgb3JpZ2luYWxGZXRjaCh1cmwsIG9wdGlvbnMpO1xuICAgIH1cblxuICAgIGlmIChvcHRpb25zLm1ldGhvZCA9PT0gJ2RlbGV0ZScpIHtcbiAgICAgIG15RGVsZXRlZE1lc3NhZ2VzLmFkZCh1cmwucGF0aG5hbWUuc2xpY2UodXJsLnBhdGhuYW1lLmxhc3RJbmRleE9mKCcvJykgKyAxKSk7XG4gICAgfVxuXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBvcmlnaW5hbEZldGNoKHVybCwgb3B0aW9ucyk7XG4gICAgcmVzcG9uc2UuanNvbiA9IG9wdGlvbnMubWV0aG9kID09PSAnZ2V0JyA/ICgpID0+IHJlc3BvbnNlLmNsb25lKCkuanNvbigpLnRoZW4oZGF0YSA9PiBvbkZldGNoUG9zdHNSZXF1ZXN0SG9vayh1cmwsIGRhdGEpKS5jYXRjaChlcnJvciA9PiBjb25zb2xlLmVycm9yKGVycm9yKSkgOiByZXNwb25zZS5qc29uO1xuICAgIHJldHVybiByZXNwb25zZTtcbiAgfTtcbn1cblxuaG9va0ZldGNoUmVxdWVzdHMoKTtcbmhvb2tXZWJzb2NrZXQoKTsiXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=