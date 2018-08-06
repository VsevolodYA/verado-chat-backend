let express = require('express');
let socket = require('socket.io');

let eventsIO = {
  CHAT_CREATE: 'CHAT_CREATE',
  CHAT_CREATED: 'CHAT_CREATED',

  POST_MESSAGE_CLIENT: 'POST_MESSAGE_CLIENT',
  POST_MESSAGE_SERVER: 'POST_MESSAGE_SERVER',

  SEND_OFFER_RESPONSE_CLIENT: 'SEND_OFFER_RESPONSE_CLIENT',
  SEND_OFFER_RESPONSE_SERVER: 'SEND_OFFER_RESPONSE_SERVER',

  CONNECT_TO_CHAT: 'CONNECT_TO_CHAT',
};

let app = express();

let store = {
  users: [],
  chats: []
};


server = app.listen(5000, function () {
  console.log('server is running on port 5000')
  console.log(store);
});

io = socket(server);

io.on('connection', (socket) => {

  socket.on(eventsIO.CHAT_CREATE, (data, res) => {
    console.log(store);
    if (! data.name || ! data.token) {
      res({success: false, body: {error: "Name or token was not presented."}})
    }

    if(data.token.length !== 40) {
      res({success: false, body: {error: "Token must be 40 symbols length."}})
    }

    let existName = store.users.findIndex(user => user.name === data.name);
    if (existName > -1) {
      res({success: false, body: {error: "This name has already been taken."}})
      return;
    }

    if(data.type === 'SELLER') {

      let chatExists = store.chats.findIndex(chat => chat.token === data.token);
      
      if(chatExists > -1) {
        res({success: false, body: {error: "Incorrect data."}})
      }

      let currentUser = addUser(data, socket.id);

      store.chats.push({
        sellerName: currentUser.name,
        token: data.token
      });

      console.log("CHATS", store.chats);

      res({success: true, body: {chatData: {sellerName: currentUser.name}} });

    } else {
      res({success: false, body: {error: "Buyer can not create chat."}})
    }

  });

  socket.on(eventsIO.CONNECT_TO_CHAT, (data, res) => {
    console.log(store);

    if (! data.name || ! data.token) {
      res({success: false, body: {error: "Name or token was not presented."}})
    }

    let existName = store.users.findIndex(user => user.name === data.name);
    if (existName > -1) {
      res({success: false, body: {error: "This name has already been taken."}})
    }

    let currentUser = addUser(data, socket.id);

    let chatIndex = getChatIndex(data.token);
    if (data.type === 'BUYER' && chatIndex > -1) {
      store.chats[chatIndex].buyerName = currentUser.name;

      let chatData = Object.assign({}, store.chats[chatIndex]);
      delete chatData.token;

      console.log(store);
      // response all data, list of all messages
      res({success: true, body: {chatData: chatData}});
    } else {
      res({success: false, body: {error: "No any chats found by this token."}})
    }
  });

  socket.on(eventsIO.POST_MESSAGE_CLIENT, (data, res) => {
    if(! data.text) {
      res({success: false, body: {error: "Message text is empty."}})
    }

    let chatIndex = getChatIndex(data.token);
    if(chatIndex === -1) {
      res({success: false, body: {error: "No any chats found by this token."}})
    }

    let sender = store.users.find(user => user.socketId === socket.id);
    if (! sender) {
      res({success: false, body: {error: "Undefined user."}});
      return;
    }

    let message = {
      id: store.chats[chatIndex].messages ? store.chats[chatIndex].messages.length + 1 : 1,
      senderName: sender.name,
      text: data.text,
      time: (new Date()).toLocaleString()
    };

    let chatData = Object.assign({}, store.chats[chatIndex]);;
    delete chatData.token;

    if (data.offer) {
      if(! data.offer.price || ! data.offer.amount) {
        res({success: false, body: {error: "Price or amount was not presented."}});
        return;
      }

      message.offer = {
        from: chatData.sellerName === sender.name ? 'SELLER' : 'BUYER',
        price: data.offer.price,
        amount: data.offer.amount,
        status: 'PENDING'
      };

      console.log('MESSAGE', message);
    }

    if(store.chats[chatIndex].messages) {
      store.chats[chatIndex].messages.push(message);
    } else {
      store.chats[chatIndex].messages = [message];
    }

    let seller = store.users.find(user => user.name === chatData.sellerName);
    let buyer = store.users.find(user => user.name === chatData.buyerName);

    console.log(seller);

    // send only to members of chat-page
    if(seller && io.sockets.connected[seller.socketId]) {
        io.sockets.connected[seller.socketId].emit(eventsIO.POST_MESSAGE_SERVER, {body: {message: message} });
    }

    if(buyer && io.sockets.connected[buyer.socketId]) {
        io.sockets.connected[buyer.socketId].emit(eventsIO.POST_MESSAGE_SERVER, {body: {message: message} });
    }

    // is it necessary ?
    res({success: true, body: {}});

  });

  socket.on(eventsIO.SEND_OFFER_RESPONSE_CLIENT, (data, res) => {

    let chatIndex = getChatIndex(data.token);
    if(chatIndex === -1) {
      res({success: false, body: {error: "No any chats found by this token."}})
    }

    let sender = store.users.find(user => user.socketId === socket.id);
    if (! sender) {
      res({success: false, body: {error: "Undefined user."}});
      return;
    }

    let status;
    if (data.status === 'ACCEPTED') {
      status = 'ACCEPTED';
    } else if (data.status === 'REJECTED') {
      status = 'REJECTED';
    } else {
      res({success: false, body: {error: "Undefined status."}});
      return;
    }

    if (! store.chats[chatIndex].messages) {
      res({success: false, body: {error: "Such offer was not found."}});
      return;
    }

    let offerMessageIndex = store.chats[chatIndex].messages.findIndex(message => message.id === data.message_id);
    store.chats[chatIndex].messages[offerMessageIndex].offer.status = status;
    let offerMessage = store.chats[chatIndex].messages[offerMessageIndex];

    console.log('OFFER MESSAGE', offerMessage);

    let seller = store.users.find(user => user.name === store.chats[chatIndex].sellerName);
    let buyer = store.users.find(user => user.name === store.chats[chatIndex].buyerName);

    console.log(seller);

    // send only to members of chat-page
    if(seller && io.sockets.connected[seller.socketId]) {
        io.sockets.connected[seller.socketId].emit(eventsIO.SEND_OFFER_RESPONSE_SERVER, {body: {message: offerMessage} });
    }

    if(buyer && io.sockets.connected[buyer.socketId]) {
        io.sockets.connected[buyer.socketId].emit(eventsIO.SEND_OFFER_RESPONSE_SERVER, {body: {message: offerMessage} });
    }

    res({success: true, body: {}});
  });

  socket.on('disconnect', function (data) {
    let removeUserIndex = store.users.findIndex(user => user.socketId === socket.id);

    if(removeUserIndex === -1) {
      return;
    }

    // if disconnect user is SELLER, then remove related chat, and disconnect and remove buyer
    if(store.users[removeUserIndex].type === 'SELLER') {
      let removeChatIndex = store.chats.findIndex(chat => chat.sellerName === store.users[removeUserIndex].name)
      if(removeChatIndex > -1) {
        let buyerIndex = store.users.findIndex(user => user.name === store.chats[removeChatIndex].buyerName);
        if(buyerIndex > -1) {
          if(io.sockets.connected[store.users[buyerIndex].socketId]) {
            io.sockets.connected[store.users[buyerIndex].socketId].disconnect();
          }
          store.users.splice(buyerIndex, 1);
        }
      }
      if(removeChatIndex > -1) {
        store.chats.splice(removeChatIndex, 1);
      }
    }

    store.users.splice(removeUserIndex, 1);

    console.log('STORE on disconnect', store);

  });

});

function addUser(data, socketId) {

  let currentUser = {
    type: data.type,
    name: data.name,
    socketId: socketId
  };

  store.users.push(currentUser);

  return currentUser;
}

function getChatIndex(token) {
  return store.chats.findIndex(chat => chat.token === token);
}