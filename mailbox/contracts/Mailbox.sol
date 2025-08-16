// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MailboxDynamic - dynamic messages with pretty explorer decoding
/// @notice Two ways to send data:
///  1) sendJson: emits a single JSON string (works for any shape)
///  2) sendKV:   emits schema + fieldKeys[] + fieldValues[] (dynamic but typed arrays)
contract MailboxDynamic {
    event MessageJSON(address indexed from, address indexed to, string schema, string json);

    event MessageKV(
        address indexed from,
        address indexed to,
        string schema,
        string[] fieldKeys,
        string[] fieldValues
    );

    function sendJson(address to, string calldata schema, string calldata json) external {
        emit MessageJSON(msg.sender, to, schema, json);
    }

    function sendKV(
        address to,
        string calldata schema,
        string[] calldata fieldKeys,
        string[] calldata fieldValues
    ) external {
        require(fieldKeys.length == fieldValues.length, "keys/values length mismatch");
        emit MessageKV(msg.sender, to, schema, fieldKeys, fieldValues);
    }
}
