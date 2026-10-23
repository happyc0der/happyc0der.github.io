/* SPDX-License-Identifier: GPL-3.0-or-later
 *
 * A null ENet for the browser build of the Atlas lab (portfolio demo atlas-lab).
 *
 * A web page cannot open UDP sockets, which is all ENet is. Atlas's own net module is compiled
 * unchanged, so the in-process loopback session is intact; this stands in for the library
 * under its socket transport (net/enet_hub.cpp). enet_initialize fails, so
 * `net::EnetRuntime::create` reports "could not initialise the socket library" and --listen
 * or --connect stop there, before anything touches the network.
 *
 * Declarations come from ENet 1.3.18's enet.h (MIT).
 */
#include <enet/enet.h>
#include <stdio.h>

int enet_initialize(void) {
    fprintf(stderr, "atlas web: a browser cannot open UDP sockets, so ENet is not available\n");
    return -1;
}
void enet_deinitialize(void) {}
enet_uint32 enet_time_get(void) { return 0; }
int enet_address_set_host(ENetAddress *address, const char *hostName) {
    (void)address; (void)hostName;
    return -1;
}
ENetHost *enet_host_create(const ENetAddress *address, size_t peerCount, size_t channelLimit,
                           enet_uint32 incomingBandwidth, enet_uint32 outgoingBandwidth) {
    (void)address; (void)peerCount; (void)channelLimit; (void)incomingBandwidth;
    (void)outgoingBandwidth;
    return NULL;
}
void enet_host_destroy(ENetHost *host) { (void)host; }
ENetPeer *enet_host_connect(ENetHost *host, const ENetAddress *address, size_t channelCount,
                            enet_uint32 data) {
    (void)host; (void)address; (void)channelCount; (void)data;
    return NULL;
}
int enet_host_service(ENetHost *host, ENetEvent *event, enet_uint32 timeout) {
    (void)host; (void)event; (void)timeout;
    return -1;
}
void enet_host_flush(ENetHost *host) { (void)host; }
ENetPacket *enet_packet_create(const void *data, size_t dataLength, enet_uint32 flags) {
    (void)data; (void)dataLength; (void)flags;
    return NULL;
}
void enet_packet_destroy(ENetPacket *packet) { (void)packet; }
int enet_peer_send(ENetPeer *peer, enet_uint8 channelID, ENetPacket *packet) {
    (void)peer; (void)channelID; (void)packet;
    return -1;
}
void enet_peer_disconnect_now(ENetPeer *peer, enet_uint32 data) { (void)peer; (void)data; }
void enet_peer_disconnect_later(ENetPeer *peer, enet_uint32 data) { (void)peer; (void)data; }
void enet_peer_ping_interval(ENetPeer *peer, enet_uint32 pingInterval) {
    (void)peer; (void)pingInterval;
}
void enet_peer_reset_queues(ENetPeer *peer) { (void)peer; }
