package com.kms.agent;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kms.agent.tool.WebSearchTool;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class WebSearchToolTest {

    @Test
    void returnsStructuredCrossrefResults() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(once(), requestTo(allOf(
                        containsString("https://api.crossref.org/works?"),
                        containsString("query=knowledge%20graph"),
                        containsString("rows=3")
                )))
                .andRespond(withSuccess("""
                        {"message":{"items":[{
                          "title":["A Knowledge Graph Paper"],
                          "author":[{"given":"Ada","family":"Lovelace"}],
                          "published":{"date-parts":[[2025]]},
                          "DOI":"10.1000/test",
                          "publisher":"Example Publisher",
                          "URL":"https://doi.org/10.1000/test"
                        }]}}
                        """, MediaType.APPLICATION_JSON));

        ObjectMapper mapper = new ObjectMapper();
        WebSearchTool tool = new WebSearchTool(mapper, builder);
        ToolResult result = tool.execute(
                ToolContext.empty(),
                mapper.createObjectNode().put("q", "knowledge graph").put("limit", 3)
        );

        assertEquals("Crossref", result.output().path("source").asText());
        assertEquals(1, result.output().path("count").asInt());
        assertEquals("10.1000/test", result.output().path("results").get(0).path("doi").asText());
        assertEquals("Ada Lovelace", result.output().path("results").get(0).path("authors").get(0).asText());
        server.verify();
    }

    @Test
    void rejectsBlankQueryWithoutNetworkCall() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ObjectMapper mapper = new ObjectMapper();
        WebSearchTool tool = new WebSearchTool(mapper, builder);

        ToolResult result = tool.execute(ToolContext.empty(), mapper.createObjectNode().put("q", "   "));

        assertTrue(result.message().contains("不能为空"));
        server.verify();
    }
}
