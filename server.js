/*************/
/* Set up the static file server */
let static = require('node-static');

/* Set up the http server library*/
let http = require('http');

/* Assume we are running on Heroku */
let port = process.env.PORT;
let directory = __dirname + '/public';

/* if we aren't on Heroku, adjust port/directory */
if ((typeof port == 'undefined') || (port === null)) {
    port = 8080;
    directory = './public';
}

/* Set up our static file web server to deliver files from system */
let file = new static.Server(directory);

let app = http.createServer(
    function (request, response) {
        request.addListener('end',
            function () {
                file.serve(request, response);
            })
            .resume();
    }
).listen(port);

console.log('The server is running');
/****************************/
/* Set up the web socket server */

// Set up a registry of players information and their socket ids
let players = []

const { Server } = require("socket.io");
const io = new Server(app);

io.on('connection', (socket) => {

    /* Output a log message on the server and send to clients */
    function serverLog(...messages) {
        io.emit('log', ['**** Message from the server:\n']);
        messages.forEach((item) => {
            io.emit('log', ['****\t' + item]);
            console.log(item);
        });
    }

    serverLog('a page connected to the server: ' + socket.id);



    /*join_room command handler */

    socket.on('join_room', (payload) => {
        serverLog('Server received a command', '\'join_room\'', JSON.stringify(payload));
        if ((typeof payload == 'undefined') || (payload === 'null')) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a payload';
            socket.emit('join_room_response', response);
            serverLog('join_room command failed', JSON.stringify(response));
            return;
        }
        let room = payload.room;
        let username = payload.username;
        if ((typeof room == 'undefined') || (room === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a valid room to join';
            socket.emit('join_room_response', response);
            serverLog('join_room command failed', JSON.stringify(response));
            return;
        }
        if ((typeof username == 'undefined') || (username === 'null')) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a valid username';
            socket.emit('join_room_response', response);
            serverLog('join_room command failed', JSON.stringify(response));
            return;
        }

        socket.join(room);

        // make sure the client was put in the room

        io.in(room).fetchSockets().then((sockets) => {
            serverLog('There are ' + sockets.length + ' clients in room, ' + room);
            if ((typeof socket == 'undefined') || (sockets === null) || !sockets.includes(socket)) {
                response = {};
                response.result = 'fail';
                response.message = 'server internal error joining chat room';
                socket.emit('join_room_response', response);
                serverLog('join_room command failed', JSON.stringify(response));
            }
            else {
                players[socket.id] = {
                    username: username,
                    room: room
                }

                // announce to everyone in the room who else is there
                for (const member of sockets) {
                    let room = players[member.id].room;
                    response = {
                        result: 'success',
                        socket_id: member.id,
                        room: players[member.id].room,
                        username: players[member.id].username,
                        count: sockets.length
                    }
                    io.of('/').to(room).emit('join_room_response', response);
                    serverLog('join_room succeeded', JSON.stringify(response));
                    if (room !== "Lobby") {
                        send_game_update(socket, room, 'initial update');
                    }
                }
            }
        });
    });

    socket.on('invite', (payload) => {
        serverLog('Server received a command', '\'invite\'', JSON.stringify(payload));
        if ((typeof payload == 'undefined') || (payload === 'null')) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a payload';
            socket.emit('invite_response', response);
            serverLog('invite command failed', JSON.stringify(response));
            return;
        }
        let requested_user = payload.requested_user;
        let room = players[requested_user].room;
        let username = players[requested_user].username;
        if ((typeof requested_user == 'undefined') || (requested_user === null) || (requested_user === "")) {
            response = {
                result: 'fail',
                message: 'client did not request a valid user to invite to play'
            }
            socket.emit('invite_response', response);
            serverLog('invite command failed', JSON.stringify(response));
            return;
        }
        if ((typeof room == 'undefined') || (room === null) || (room === "")) {
            response = {
                result: 'fail',
                message: 'the invited user is not in a room'
            }
            socket.emit('invite_response', response);
            serverLog('invite command failed', JSON.stringify(response));
            return;
        }
        if ((typeof username == 'undefined') || (username === 'null') || (username === "")) {
            response = {
                result: 'fail',
                message: 'the invited user has no username registered'
            }
            socket.emit('invite_response', response);
            serverLog('invite command failed', JSON.stringify(response));
            return;
        }
        // make sure invited player is present

        io.in(room).allSockets().then((sockets) => {
            // invitee isn't in the room
            serverLog('There are ' + sockets.length + ' clients in room, ' + room);
            if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.has(requested_user)) {
                response = {
                    result: 'fail',
                    message: 'the invited user is no longer in the room'
                }
                socket.emit('invite_response', response);
                serverLog('invite command failed', JSON.stringify(response));
                return;
            }
            // Invitee is in the room
            else {
                response = {
                    result: 'success',
                    socket_id: requested_user
                }
                socket.emit("invite_response", response);
                response = {
                    result: 'success',
                    socket_id: socket.id
                }
                socket.to(requested_user).emit("invited", response);
                serverLog('invite command succeeded', JSON.stringify(response))
            }
        });
    });

    //uninvite

    socket.on('uninvite', (payload) => {
        serverLog('Server received a command', '\'invite\'', JSON.stringify(payload));
        if ((typeof payload == 'undefined') || (payload === 'null')) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a payload';
            socket.emit('uninvited', response);
            serverLog('uninvite command failed', JSON.stringify(response));
            return;
        }
        let requested_user = payload.requested_user;
        let room = players[requested_user].room;
        let username = players[requested_user].username;
        if ((typeof requested_user == 'undefined') || (requested_user === null) || (requested_user === "")) {
            response = {
                result: 'fail',
                message: 'client did not request a valid user to uninvite to play'
            }
            socket.emit('uninvited', response);
            serverLog('uninvite command failed', JSON.stringify(response));
            return;
        }
        if ((typeof room == 'undefined') || (room === null) || (room === "")) {
            response = {
                result: 'fail',
                message: 'the uninvited user is not in a room'
            }
            socket.emit('uninvited', response);
            serverLog('uninvite command failed', JSON.stringify(response));
            return;
        }
        if ((typeof username == 'undefined') || (username === 'null') || (username === "")) {
            response = {
                result: 'fail',
                message: 'the uninvited user has no username registered'
            }
            socket.emit('uninvited', response);
            serverLog('uninvite command failed', JSON.stringify(response));
            return;
        }
        // make sure uninvited player is present

        io.in(room).allSockets().then((sockets) => {
            // uninvitee isn't in the room
            serverLog('There are ' + sockets.length + ' clients in room, ' + room);
            if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.has(requested_user)) {
                response = {
                    result: 'fail',
                    message: 'the uninvited user is no longer in the room'
                }
                socket.emit('uninvited', response);
                serverLog('uninvite command failed', JSON.stringify(response));
                return;
            }
            // Uninvitee is in the room
            else {
                response = {
                    result: 'success',
                    socket_id: requested_user
                }
                socket.emit("uninvited", response);
                response = {
                    result: 'success',
                    socket_id: socket.id
                }
                socket.to(requested_user).emit("uninvited", response);
                serverLog('uninvite command succeeded', JSON.stringify(response))
            }
        });
    });

    // game start handling

    socket.on('game_start', (payload) => {
        serverLog('Server received a command', '\'game_start\'', JSON.stringify(payload));
        if ((typeof payload == 'undefined') || (payload === 'null')) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a payload';
            socket.emit('game_start_response', response);
            serverLog('game_start command failed', JSON.stringify(response));
            return;
        }
        let requested_user = payload.requested_user;
        let room = players[requested_user].room;
        let username = players[requested_user].username;
        if ((typeof requested_user == 'undefined') || (requested_user === null) || (requested_user === "")) {
            response = {
                result: 'fail',
                message: 'client did not request a valid user to uninvite to play'
            }
            socket.emit('game_start_response', response);
            serverLog('game_start command failed', JSON.stringify(response));
            return;
        }
        if ((typeof room == 'undefined') || (room === null) || (room === "")) {
            response = {
                result: 'fail',
                message: 'the player is not in a room'
            }
            socket.emit('game_start_response', response);
            serverLog('game_start command failed', JSON.stringify(response));
            return;
        }
        if ((typeof username == 'undefined') || (username === 'null') || (username === "")) {
            response = {
                result: 'fail',
                message: 'the player has no username registered'
            }
            socket.emit('game_start_response', response);
            serverLog('game_start command failed', JSON.stringify(response));
            return;
        }
        // make sure player is present and still available

        io.in(room).allSockets().then((sockets) => {
            // Player isn't in the room and available
            serverLog('There are ' + sockets.length + ' clients in room, ' + room);
            if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.has(requested_user)) {
                response = {
                    result: 'fail',
                    message: 'the player is no longer in the room or available'
                }
                socket.emit('game_start_response', response);
                serverLog('game_start command failed', JSON.stringify(response));
                return;
            }
            // Player is in the room and available
            else {
                let game_id = Math.floor(1 + Math.random() * 0x100000).toString(16);
                response = {
                    result: 'success',
                    game_id: game_id,
                    socket_id: requested_user
                }
                socket.emit("game_start_response", response);
                socket.to(requested_user).emit("game_start_response", response);
                serverLog('game_start command succeeded', JSON.stringify(response))
            }
        });
    });

    socket.on('disconnect', () => {
        serverLog('a page disconnected from the server: ' + socket.id);
        if ((typeof players[socket.id] != 'undefined') && (players[socket.id] != 'null')) {
            let payload = {
                username: players[socket.id].username,
                room: players[socket.id].room,
                count: Object.keys(players).length - 1,
                socket_id: socket.id
            };
            let room = players[socket.id].room;
            delete players[socket.id];
            // Tell everyone who left
            io.of('/').to(room).emit('player_disconnected', payload);
            serverLog('player_disconnected succeeded', JSON.stringify(payload));
        }
    });

    /* send_chat message command handler */

    socket.on('send_chat_message', (payload) => {
        serverLog('Server received a command', '\'send_chat_message\'', JSON.stringify(payload));
        if ((typeof payload == 'undefined') || (payload === 'null')) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a payload';
            socket.emit('send_chat_message_response', response);
            serverLog('send_chat_message command failed', JSON.stringify(response));
            return;
        }
        let room = payload.room;
        let username = payload.username;
        let message = payload.message;
        if ((typeof room == 'undefined') || (room === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a valid room to message';
            socket.emit('send_chat_message_response', response);
            serverLog('send_chat_message command failed', JSON.stringify(response));
            return;
        }
        if ((typeof username == 'undefined') || (username === 'null')) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a valid username as a message source';
            socket.emit('send_chat_message_response', response);
            serverLog('send_chat_message command failed', JSON.stringify(response));
            return;
        }
        if ((typeof message == 'undefined') || (message === 'null')) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a valid message';
            socket.emit('send_chat_message_response', response);
            serverLog('send_chat_message command failed', JSON.stringify(response));
            return;
        }

        /* Handle the command */
        let response = {};
        response.result = 'success';
        response.username = username;
        response.room = room;
        response.message = message;

        /* tell everyone what the message is*/
        io.of('/').to(room).emit('send_chat_message_response', response);
        serverLog('send_chat_message command succeeded'), JSON.stringify(response);
        socket.join(room);

    });

    // Place a token

    socket.on('play_token', (payload) => {
        serverLog('Server received a command', '\'play_token\'', JSON.stringify(payload));
        if ((typeof payload == 'undefined') || (payload === 'null')) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a payload';
            socket.emit('play_token_response', response);
            serverLog('play_token command failed', JSON.stringify(response));
            return;
        }

        let player = players[socket.id];
        if ((typeof player == 'undefined') || (player === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'play_token came from unregistered player';
            socket.emit('play_token_response', response);
            serverLog('play_token command failed', JSON.stringify(response));
            return;
        }

        let username = player.username;
        if ((typeof username == 'undefined') || (username === 'null')) {
            response = {};
            response.result = 'fail';
            response.message = 'play_token command did not come from registered username';
            socket.emit('play_token_response', response);
            serverLog('play_token command failed', JSON.stringify(response));
            return;
        }

        let game_id = player.room;
        if ((typeof game_id == 'undefined') || (game_id === 'null')) {
            response = {};
            response.result = 'fail';
            response.message = 'there was no valid game associated with play_token command';
            socket.emit('play_token_response', response);
            serverLog('play_token command failed', JSON.stringify(response));
            return;
        }

        let row = payload.row;
        if ((typeof row == 'undefined') || (row === 'null')) {
            response = {};
            response.result = 'fail';
            response.message = 'there was no valid row associated with play_token command';
            socket.emit('play_token_response', response);
            serverLog('play_token command failed', JSON.stringify(response));
            return;
        }

        let column = payload.column;
        if ((typeof column == 'undefined') || (column === 'null')) {
            response = {};
            response.result = 'fail';
            response.message = 'there was no valid column associated with play_token command';
            socket.emit('play_token_response', response);
            serverLog('play_token command failed', JSON.stringify(response));
            return;
        }

        let color = payload.color;
        if ((typeof color == 'undefined') || (color === 'null')) {
            response = {};
            response.result = 'fail';
            response.message = 'there was no valid color associated with play_token command';
            socket.emit('play_token_response', response);
            serverLog('play_token command failed', JSON.stringify(response));
            return;
        }

        let game = games[game_id];
        if ((typeof game == 'undefined') || (game === 'null')) {
            response = {};
            response.result = 'fail';
            response.message = 'there was no valid game associated with play_token command';
            socket.emit('play_token_response', response);
            serverLog('play_token command failed', JSON.stringify(response));
            return;
        }

        // error checking :)
        // (1) make sure the right color is taking the current turn
        if (color !== game.whose_turn) {
            let response = {
                result: 'fail',
                message: 'play_token played wrong color; it is not their turn'
            }
            socket.emit('play_token_response', response);
            serverLog('play_token command failed', JSON.stringify(response));
            return;
        }

        // (2) make sure the right player is taking the current turn
        if (
            ((game.whose_turn === 'blue') && (game.player_blue.socket != socket.id)) ||
            ((game.whose_turn === 'green') && (game.player_green.socket != socket.id))
        ) {
            let response = {
                result: 'fail',
                message: 'play_token played right color, but by wrong person; it is not their turn'
            }
            socket.emit('play_token_response', response);
            serverLog('play_token command failed', JSON.stringify(response));
            return;
        }

        let response = {
            result: 'success'
        }
        socket.emit('play_token_response', response);

        // Execute the move!
        if (color === 'blue') {
            game.board[row][column] = 'b';
            flip_tokens('b', row, column, game.board);
            game.whose_turn = 'green';
            game.legal_moves = calculate_legal_moves('g', game.board);
        }
        else if (color === 'green') {
            game.board[row][column] = 'g';
            flip_tokens('g', row, column, game.board);
            game.whose_turn = 'blue';
            game.legal_moves = calculate_legal_moves('b', game.board);
        }

        let d = new Date();
        game.last_move_time = d.getTime();


        send_game_update(socket, game_id, 'played a token');
    });
});


/**********************/
/* Code related to game state */

let games = [];

function create_new_game() {
    let new_game = {};
    new_game.player_blue = {};
    new_game.player_blue.socket = "";
    new_game.player_blue.username = "";
    new_game.player_green = {};
    new_game.player_green.socket = "";
    new_game.player_green.username = "";

    var d = new Date();
    new_game.last_move_time = d.getTime();

    new_game.whose_turn = 'green';

    new_game.board = [
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', 'b', 'g', ' ', ' ', ' '],
        [' ', ' ', ' ', 'g', 'b', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ']
    ];

    new_game.legal_moves = calculate_legal_moves('g', new_game.board);

    return new_game;
}

function check_line_match(color, dr, dc, r, c, board) {

    if (board[r][c] === color) {
        return true;
    }
    if (board[r][c] === ' ') {
        return false;
    }
    //make sure we wont go off board 
    if ((r + dr < 0) || (r + dr > 7)) {
        return false;
    }
    if ((c + dc < 0) || (c + dc > 7)) {
        return false;
    }

    return (check_line_match(color, dr, dc, r + dr, c + dc, board));
}

// return "true" if r+dr supports playing at r and c+dc support playing at c
function adjacent_support(who, dr, dc, r, c, board) {
    let other;
    if (who === 'g') {
        other = 'b';
    }
    else if (who === 'b') {
        other = 'g';
    }
    else {
        log("Houston we have a problelm: " + who);
        return false;
    }

    // check to make sure adjacent support is on the board 
    if ((r + dr < 0) || (r + dr > 7)) {
        return false;
    }
    if ((c + dc < 0) || (c + dc > 7)) {
        return false;
    }
    if (board[r + dr][c + dc] !== other) {
        return false;
    }

    // check to make sure room for matching color to capture token
    if ((r + dr + dr < 0) || (r + dr + dr > 7)) {
        return false;
    }
    if ((c + dc + dc < 0) || (c + dc + dc > 7)) {
        return false;
    }

    return check_line_match(who, dr, dc, r + dr + dr, c + dc + dc, board);

}

function calculate_legal_moves(who, board) {
    let legal_moves = [
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ']
    ];

    for (let row = 0; row < 8; row++) {
        for (let column = 0; column < 8; column++) {
            if (board[row][column] === ' ') {
                nw = adjacent_support(who, -1, -1, row, column, board);
                nn = adjacent_support(who, -1, 0, row, column, board);
                ne = adjacent_support(who, -1, 1, row, column, board);

                ww = adjacent_support(who, 0, -1, row, column, board);
                ee = adjacent_support(who, 0, 1, row, column, board);

                sw = adjacent_support(who, 1, -1, row, column, board);
                ss = adjacent_support(who, 1, 0, row, column, board);
                se = adjacent_support(who, 1, 1, row, column, board);
                if (nw || nn || ne || ww || ee || sw || ss || se) {
                    legal_moves[row][column] = who;
                }

            }
        }
    }
    return legal_moves;
}

function flip_line(who, dr, dc, r, c, board) {

    if ((r + dr < 0) || (r + dr > 7)) {
        return false;
    }
    if ((c + dc < 0) || (c + dc > 7)) {
        return false;
    }
    if (board[r + dr][c + dc] === ' ') {
        return false;
    }
    if (board[r + dr][c + dc] === who) {
        return true;
    }
    else {
        if (flip_line(who, dr, dc, r + dr, c + dc, board)) {
            board[r + dr][c + dc] = who;
            return true;
        }
        else {
            return false;
        }
    }
}

function flip_tokens(who, row, column, board) {
    flip_line(who, -1, -1, row, column, board);
    flip_line(who, -1, 0, row, column, board);
    flip_line(who, -1, 1, row, column, board);

    flip_line(who, 0, -1, row, column, board);
    flip_line(who, 0, 1, row, column, board);

    flip_line(who, 1, -1, row, column, board);
    flip_line(who, 1, 0, row, column, board);
    flip_line(who, 1, 1, row, column, board);
}

function send_game_update(socket, game_id, message) {

    // check to see if game with game_id exists
    if ((typeof games[game_id] == 'undefined') || (games[game_id] === null)) {
        console.log("No game exists with game_id: " + game_id + ". Making a new game for " + socket.id);
        games[game_id] = create_new_game();
    }

    // make sure only 2 ppl in room
    // assign socket a color
    io.of('/').to(game_id).allSockets().then((sockets) => {

        const iterator = sockets[Symbol.iterator]();

        if (sockets.size >= 1) {
            let first = iterator.next().value;
            if ((games[game_id].player_blue.socket != first) &&
                (games[game_id].player_green.socket != first)) {
                // player does not have color
                if (games[game_id].player_blue.socket === "") {
                    console.log("Blue is assigned to :" + first);
                    games[game_id].player_blue.socket = first;
                    games[game_id].player_blue.username = players[first].username;
                }
                else if (games[game_id].player_green.socket === "") {
                    console.log("Green is assigned to :" + first);
                    games[game_id].player_green.socket = first;
                    games[game_id].player_green.username = players[first].username;
                }
                else {
                    // this player should be kicked out
                    console.log("Kicking " + first + " out of game: " + game_id);
                    io.in(first).socketsLeave([game_id]);
                }
            }
        }

        if (sockets.size >= 2) {
            let second = iterator.next().value;
            if ((games[game_id].player_blue.socket != second) &&
                (games[game_id].player_green.socket != second)) {
                // player does not have color
                if (games[game_id].player_blue.socket === "") {
                    console.log("Blue is assigned to :" + second);
                    games[game_id].player_blue.socket = second;
                    games[game_id].player_blue.username = players[second].username;
                }
                else if (games[game_id].player_green.socket === "") {
                    console.log("Green is assigned to :" + second);
                    games[game_id].player_green.socket = second;
                    games[game_id].player_green.username = players[second].username;
                }
                else {
                    // this player should be kicked out
                    console.log("Kicking " + second + " out of game: " + game_id);
                    io.in(second).socketsLeave([game_id]);
                }
            }
        }

        // send game update
        let payload = {
            result: 'success',
            game_id: game_id,
            game: games[game_id],
            message: message
        }
        io.of("/").to(game_id).emit('game_update', payload);
    })

    // check if game is over
    let legal_moves = 0;
    let bluesum = 0;
    let greensum = 0;

    for (let row = 0; row < 8; row++) {
        for (let column = 0; column < 8; column++) {
            if (games[game_id].legal_moves[row][column] !== ' ') {
                legal_moves++;
            }
            if (games[game_id].board[row][column] === 'b') {
                bluesum++;
            }
            if (games[game_id].board[row][column] === 'g') {
                greensum++;
            }
        }
    }
    if (legal_moves === 0) {

        let winner = "Tie Game - everyone";
        if (bluesum > greensum) {
            winner = "BLUE"
        }
        if (bluesum < greensum) {
            winner = "GREEN"
        }

        let payload = { //this payload is not working help!!
            result: 'success',
            game_id: game_id,
            game: games[game_id],
            who_won: winner
        }
        io.in(game_id).emit('game_over', payload);

        // Delete old games after 1 hour

        setTimeout(
            ((id) => {
                return (() => {
                    delete games[id];
                });
            })(game_id), 60 * 60 * 1000
        );

    }

}