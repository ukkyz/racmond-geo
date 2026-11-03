package io.racmond.accounting;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Component
public class LabSecurityFilter extends OncePerRequestFilter {
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        String expected=System.getenv("LAB_INTERNAL_TOKEN");
        String actual=request.getHeader("X-Racmond-Lab-Token");
        if(expected==null||expected.isBlank()||actual==null||!MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),actual.getBytes(StandardCharsets.UTF_8))) {
            response.setStatus(403);response.setContentType("application/json");response.getWriter().write("{\"error\":\"Internal lab authentication required\"}");return;
        }
        chain.doFilter(request,response);
    }
}
